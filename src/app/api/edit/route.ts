import { requireOwner } from "@/lib/require-owner";
import { NextRequest, NextResponse } from "next/server";
import type OpenAI from "openai";
import { getOpenAI, MODEL, normalizeCompression, validateFormatBackground, validateSize } from "@/lib/openai";
import { buildPrompt, defaultReferenceRole, sanitizePromptInputs } from "@/lib/prompt-builder";
import { compositeMaskedEdit } from "@/lib/mask-composite";
import { persistGeneratedImage, transparencyWarning } from "@/lib/save-image";
import { actualSizeOr, usageToFields } from "@/lib/pricing";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;

  const form = await req.formData();

  const rawPrompt = form.get("prompt");
  const size = (form.get("size") as string) || "1024x1024";
  const quality = (form.get("quality") as string) || "medium";
  const format = (form.get("format") as string) || "png";
  const background = (form.get("background") as string) || "auto";
  const model = (form.get("model") as string) || MODEL[0];
  const referenceImageIds = JSON.parse((form.get("referenceImageIds") as string) || "[]");
  const tag = (form.get("tag") as string) || null;
  // Refine chain link. Not a FK (deleting a parent must not cascade), so just require a UUID.
  const rawParent = form.get("parentImageId");
  const parentImageId =
    typeof rawParent === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawParent)
      ? rawParent
      : null;

  let rawPromptInputs: unknown = null;
  try {
    const json = form.get("promptInputs");
    if (typeof json === "string" && json) rawPromptInputs = JSON.parse(json);
  } catch {
    return NextResponse.json({ error: "promptInputs must be valid JSON" }, { status: 400 });
  }
  const promptInputs = sanitizePromptInputs(rawPromptInputs);
  const base = promptInputs?.base ?? rawPrompt;
  if (!base || typeof base !== "string") {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const sizeError = validateSize(size);
  if (sizeError) {
    return NextResponse.json({ error: sizeError }, { status: 400 });
  }

  const formatError = validateFormatBackground(format, background);
  if (formatError) {
    return NextResponse.json({ error: formatError }, { status: 400 });
  }
  const compression = normalizeCompression(format, form.get("compression"));

  const files = form.getAll("images").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "At least one reference image is required" }, { status: 400 });
  }

  // Roles are aligned with upload order; when the client sent none, default them so the
  // stored record always has one entry per reference image.
  if (promptInputs?.referenceRoles && promptInputs.referenceRoles.length !== files.length) {
    return NextResponse.json({ error: "referenceRoles must match the number of images" }, { status: 400 });
  }
  const referenceRoles =
    promptInputs?.referenceRoles ?? files.map((_, i) => ({ role: defaultReferenceRole(i) }));
  const prompt = promptInputs ? buildPrompt({ ...promptInputs, referenceRoles }) : base;

  const mask = form.get("mask");
  if (mask instanceof File && files.length !== 1) {
    return NextResponse.json(
      { error: "A mask can only be used with a single reference image" },
      { status: 400 }
    );
  }

  const openai = getOpenAI();

  try {
    const t0 = Date.now();
    const result = await openai.images.edit({
      model,
      image: files.length === 1 ? files[0] : files,
      ...(mask instanceof File ? { mask } : {}),
      prompt,
      size: size as OpenAI.ImageEditParams["size"],
      quality: quality as OpenAI.ImageEditParams["quality"],
      output_format: format as OpenAI.ImageEditParams["output_format"],
      background: background as OpenAI.ImageEditParams["background"],
      ...(compression != null ? { output_compression: compression } : {}),
      n: 1,
      stream: false,
    });

    const durationMs = Date.now() - t0;
    let b64 = result.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json({ error: "No image data returned from OpenAI" }, { status: 502 });
    }

    // With a mask, paste the edited region back onto the original so everything the mask
    // protects stays pixel-for-pixel as it was (on by default; compositeMask=false opts out).
    let finalSize = actualSizeOr(size, result.size);
    let compositeWarning: string | undefined;
    if (mask instanceof File && form.get("compositeMask") !== "false") {
      try {
        const composed = await compositeMaskedEdit({
          original: Buffer.from(await files[0].arrayBuffer()),
          mask: Buffer.from(await mask.arrayBuffer()),
          result: Buffer.from(b64, "base64"),
          format,
          compression,
        });
        b64 = composed.buffer.toString("base64");
        // The composite has the original's dimensions, not whatever the model returned.
        finalSize = `${composed.width}x${composed.height}`;
      } catch (err) {
        // Don't lose a paid generation over a compositing failure; save the raw output.
        console.error("edit: mask compositing failed", err);
        compositeWarning = "Mask compositing failed; saved the model's raw output instead";
      }
    }

    const image = await persistGeneratedImage({
      b64,
      prompt,
      revisedPrompt: result.data?.[0]?.revised_prompt ?? null,
      model,
      size: finalSize,
      requestedSize: size,
      quality,
      format,
      background,
      sourceType: "edit",
      referenceImageIds,
      tag,
      promptInputs: promptInputs ? { ...promptInputs, referenceRoles } : null,
      referenceRoles,
      parentImageId,
      previewPartials: 0,
      outputCompression: compression,
      durationMs,
      ...usageToFields(result.usage),
    });

    const warning = [compositeWarning, transparencyWarning(image)].filter(Boolean).join("; ") || undefined;
    return NextResponse.json({ image, warning });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Edit failed" },
      { status: 500 }
    );
  }
}
