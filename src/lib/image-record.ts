import type { ImageRow } from "@/db/schema";
import type { ImageRecord } from "./types";

/** The one place a DB row becomes an API/client `ImageRecord`. */
export function rowToImageRecord(row: ImageRow): ImageRecord {
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
    actualCost: row.actualCost,
    requestedSize: row.requestedSize,
    previewPartials: row.previewPartials,
    inputTokens: row.inputTokens,
    inputImageTokens: row.inputImageTokens,
    outputTokens: row.outputTokens,
    durationMs: row.durationMs,
    outputCompression: row.outputCompression,
    transparencyOk: row.transparencyOk,
    parentImageId: row.parentImageId,
    promptInputs: row.promptInputs,
    referenceRoles: row.referenceRoles,
    compareGroupId: row.compareGroupId,
    createdAt: row.createdAt.toISOString(),
  };
}
