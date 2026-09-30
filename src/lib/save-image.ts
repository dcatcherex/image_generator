import { put } from "@vercel/blob";
import { randomUUID } from "crypto";
import { getDb } from "@/db";
import { images } from "@/db/schema";
import { estimateCost } from "./pricing";
import sharp from "sharp";
import { rowToImageRecord } from "./image-record";
import type { PromptInputs, ReferenceRole } from "./prompt-builder";
import type { ImageRecord } from "./types";

function contentTypeFor(format: string) {
  if (format === "webp") return "image/webp";
  if (format === "jpeg") return "image/jpeg";
  return "image/png";
}

export const TRANSPARENCY_WARNING = "Transparent background requested but the image is fully opaque";

/** Warning text for the client when a transparent background was requested but not delivered. */
export function transparencyWarning(image: ImageRecord): string | undefined {
  return image.background === "transparent" && image.transparencyOk === false
    ? TRANSPARENCY_WARNING
    : undefined;
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
  // Measurement + edit-workflow fields (all optional; see the `images` table comments).
  requestedSize?: string | null;
  previewPartials?: number | null;
  actualCost?: number | null;
  inputTokens?: number | null;
  inputImageTokens?: number | null;
  outputTokens?: number | null;
  durationMs?: number | null;
  outputCompression?: number | null;
  transparencyOk?: boolean | null;
  parentImageId?: string | null;
  promptInputs?: PromptInputs | null;
  referenceRoles?: Array<{ role: ReferenceRole; note?: string }> | null;
  compareGroupId?: string | null;
}): Promise<ImageRecord> {
  const buffer = Buffer.from(params.b64, "base64");
  const pathname = `images/${randomUUID()}.${params.format}`;

  const blob = await put(pathname, buffer, {
    access: "public",
    contentType: contentTypeFor(params.format),
  });

  // Transparent backgrounds sometimes come back opaque; check the decoded pixels rather than
  // trusting the request. A decode failure just leaves the check unknown.
  let transparencyOk = params.transparencyOk ?? null;
  if (params.background === "transparent") {
    try {
      transparencyOk = !(await sharp(buffer).stats()).isOpaque;
    } catch (err) {
      console.error("save-image: alpha check failed", err);
    }
  }

  const db = getDb();
  const cost = estimateCost(params.quality, params.requestedSize ?? params.size, {
    partials: params.previewPartials ?? 0,
    promptChars: params.prompt.length,
  }).usd.toString();

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
      actualCost: params.actualCost != null ? params.actualCost.toString() : null,
      requestedSize: params.requestedSize ?? null,
      previewPartials: params.previewPartials ?? null,
      inputTokens: params.inputTokens ?? null,
      inputImageTokens: params.inputImageTokens ?? null,
      outputTokens: params.outputTokens ?? null,
      durationMs: params.durationMs ?? null,
      outputCompression: params.outputCompression ?? null,
      transparencyOk,
      parentImageId: params.parentImageId ?? null,
      promptInputs: params.promptInputs ?? null,
      referenceRoles: params.referenceRoles ?? null,
      compareGroupId: params.compareGroupId ?? null,
    })
    .returning();

  return rowToImageRecord(row);
}
