import { pgTable, uuid, text, boolean, timestamp, numeric, jsonb } from "drizzle-orm/pg-core";

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
  sourceType: text("source_type").notNull(), // 'generate' | 'edit'
  referenceImageIds: jsonb("reference_image_ids").$type<string[]>().default([]),
  costEstimate: numeric("cost_estimate", { precision: 10, scale: 4 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ImageRow = typeof images.$inferSelect;
export type NewImageRow = typeof images.$inferInsert;
