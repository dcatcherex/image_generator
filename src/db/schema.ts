import { pgTable, uuid, text, boolean, timestamp, numeric, jsonb, integer } from "drizzle-orm/pg-core";
import type { BatchRequestMeta } from "@/lib/batch";

export const images = pgTable("images", {
  id: uuid("id").primaryKey().defaultRandom(),
  prompt: text("prompt").notNull(),
  revisedPrompt: text("revised_prompt"),
  model: text("model").notNull(),
  size: text("size").notNull(),
  quality: text("quality").notNull(),
  format: text("format").notNull().default("png"),
  background: text("background").notNull().default("auto"),
  blobUrl: text("blob_url").notNull(),
  blobPathname: text("blob_pathname").notNull(),
  favorite: boolean("favorite").notNull().default(false),
  // One of ASSIGNABLE_TAGS in src/lib/tags.ts, or null for untagged. Nullable rather than
  // a DB enum so the fixed list can change without a migration.
  tag: text("tag"),
  sourceType: text("source_type").notNull(), // 'generate' | 'edit'
  referenceImageIds: jsonb("reference_image_ids").$type<string[]>().default([]),
  costEstimate: numeric("cost_estimate", { precision: 10, scale: 4 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ImageRow = typeof images.$inferSelect;
export type NewImageRow = typeof images.$inferInsert;

// "Economy mode" batch jobs (OpenAI Batch API — async, ~50% cheaper, up to 24h turnaround).
// Deliberately a separate table from `images`: a batch job has its own lifecycle (spans
// multiple not-yet-existing images) and isn't a row we'd ever want to show as a real image.
export const batchJobs = pgTable("batch_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  openaiBatchId: text("openai_batch_id").notNull(),
  inputFileId: text("input_file_id").notNull(),
  outputFileId: text("output_file_id"),
  errorFileId: text("error_file_id"),
  // Mirrors OpenAI's batch status (validating|in_progress|finalizing|completed|expired|
  // cancelling|cancelled|failed), plus our own "ingested" once we've turned a completed
  // batch's output into real `images` rows — distinguishing "completed" from "ingested"
  // is what stops us from double-persisting images on repeat polls.
  status: text("status").notNull(),
  requestCount: integer("request_count").notNull(),
  completedCount: integer("completed_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  // One entry per line submitted in the .jsonl, keyed by customId, so that when results
  // come back keyed by custom_id we know the original generation params to persist with.
  requests: jsonb("requests").$type<BatchRequestMeta[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BatchJobRow = typeof batchJobs.$inferSelect;
export type NewBatchJobRow = typeof batchJobs.$inferInsert;
