import type { ImageRow } from "@/db/schema";
import type { ImageRecord } from "./types";
import { stripBrandSection } from "./prompt-builder";

/** The one place a DB row becomes an API/client `ImageRecord`. */
export function rowToImageRecord(row: ImageRow): ImageRecord {
  return {
    id: row.id,
    prompt: row.prompt,
    revisedPrompt: row.revisedPrompt,
    model: row.model,
    size: row.size,
    quality: row.quality,
    complexity: row.complexity,
    frameCount: row.frameCount,
    frameDurationMs: row.frameDurationMs,
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
    brandId: row.brandId,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Brands are owner-only, so public viewers get records with brand fields removed: the id,
 * the snapshot in promptInputs and the "Brand:" section of the assembled prompt. */
export function publicImageRecord(record: ImageRecord): ImageRecord {
  if (!record.promptInputs?.brand) return { ...record, brandId: null };
  const inputs = { ...record.promptInputs };
  delete inputs.brand;
  return { ...record, brandId: null, promptInputs: inputs, prompt: stripBrandSection(record.prompt) };
}
