import { pgTable, uuid, text, boolean, timestamp, numeric, jsonb, integer } from "drizzle-orm/pg-core";
import type { BatchRequestMeta } from "@/lib/batch";
import type { PromptInputs, ReferenceRole } from "@/lib/prompt-builder";

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
  // --- Measurement + edit-workflow columns (ENHANCEMENTS.md). All nullable so rows that
  // predate them stay valid. ---
  // USD computed from the response `usage` (see actualCostFromUsage in pricing.ts).
  actualCost: numeric("actual_cost", { precision: 10, scale: 4 }),
  // What the user asked for ("auto" or WxH). `size` above holds the *actual* returned
  // dimensions when the API reports them (`auto` returns non-multiple-of-16 sizes), while
  // cost stats group by this, since it's what's known before generating.
  requestedSize: text("requested_size"),
  // Streamed partial images requested (0 when live preview is off) — each bills 100 output
  // tokens, so this is needed to reconcile cost.
  previewPartials: integer("preview_partials"),
  inputTokens: integer("input_tokens"),
  inputImageTokens: integer("input_image_tokens"),
  outputTokens: integer("output_tokens"),
  // Server-measured OpenAI request start -> final image bytes (excludes Blob/DB time).
  durationMs: integer("duration_ms"),
  outputCompression: integer("output_compression"), // 0-100, JPEG/WebP only
  // Only set when background=transparent: true if the decoded image has any non-opaque pixel.
  transparencyOk: boolean("transparency_ok"),
  // Refine chain. Deliberately not a FK: deleting a parent must not cascade.
  parentImageId: uuid("parent_image_id"),
  promptInputs: jsonb("prompt_inputs").$type<PromptInputs>(),
  // Aligned with referenceImageIds / upload order.
  referenceRoles: jsonb("reference_roles").$type<Array<{ role: ReferenceRole; note?: string }>>(),
  // Shared by the two images of a model comparison.
  compareGroupId: uuid("compare_group_id"),
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
