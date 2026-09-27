import { put } from "@vercel/blob";
import { randomUUID } from "crypto";
import { getDb } from "@/db";
import { images } from "@/db/schema";
import { estimateCost } from "./pricing";
import type { ImageRecord } from "./types";

function contentTypeFor(format: string) {
  if (format === "webp") return "image/webp";
  if (format === "jpeg") return "image/jpeg";
  return "image/png";
}

export async function persistGeneratedImage(params: {
  b64: string;
  prompt: string;
  revisedPrompt?: string | null;
  model: string;
  size: string;
  quality: string;
  format: string;
  background: string;
  sourceType: "generate" | "edit";
  referenceImageIds?: string[];
  tag?: string | null;
}): Promise<ImageRecord> {
  const buffer = Buffer.from(params.b64, "base64");
  const pathname = `images/${randomUUID()}.${params.format}`;

  const blob = await put(pathname, buffer, {
    access: "public",
    contentType: contentTypeFor(params.format),
  });

  const db = getDb();
  const cost = estimateCost(params.quality, params.size).toString();

  const [row] = await db
    .insert(images)
    .values({
      prompt: params.prompt,
      revisedPrompt: params.revisedPrompt ?? null,
      model: params.model,
      size: params.size,
      quality: params.quality,
      format: params.format,
      background: params.background,
      blobUrl: blob.url,
      blobPathname: pathname,
      sourceType: params.sourceType,
      referenceImageIds: params.referenceImageIds ?? [],
      costEstimate: cost,
      tag: params.tag ?? null,
    })
    .returning();

  return {
    id: row.id,
    prompt: row.prompt,
    revisedPrompt: row.revisedPrompt,
    model: row.model,
    size: row.size,
    quality: row.quality,
    format: row.format,
    background: row.background,
    blobUrl: row.blobUrl,
    blobPathname: row.blobPathname,
    favorite: row.favorite,
    tag: row.tag,
    sourceType: row.sourceType as "generate" | "edit",
    referenceImageIds: row.referenceImageIds ?? [],
    costEstimate: row.costEstimate,
    createdAt: row.createdAt.toISOString(),
  };
}
