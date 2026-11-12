import { requireOwner } from "@/lib/require-owner";
import { NextRequest } from "next/server";
import { complexityParam, getOpenAI, DEFAULT_MODEL, normalizeCompression, supportsSvg, svgParams, unsafeSvgReason, supportsGif, normalizeGif, gifParams, validateFormatBackground, validateSize } from "@/lib/openai";
import { persistGeneratedImage, transparencyWarning } from "@/lib/save-image";
import { buildPrompt, sanitizeBrandRequest, sanitizePromptInputs } from "@/lib/prompt-builder";
import { resolveBrand } from "@/lib/brand-prompt";
import { sseStreamFromEvents } from "@/lib/sse";
import { actualSizeOr, usageToFields, type ImageUsage } from "@/lib/pricing";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Streamed partial images requested when live preview is on (each bills 100 output tokens).
const PREVIEW_PARTIALS = 2;

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;

  const body = await req.json();
  const {
    prompt: rawPrompt,
    promptInputs: rawPromptInputs,
    size = "1024x1024",
    quality = "medium",
    format = "png",
    background = "auto",
    model = DEFAULT_MODEL,
    n = 1,
    tag = null,
    preview = false,
    compression: rawCompression = null,
    compareGroupId: rawCompareGroupId = null,
    complexity = null,
    frameCount = null,
    frameDurationMs = null,
  } = body ?? {};

  // Structured inputs are authoritative; a plain `prompt` string stays supported and is
  // treated as `{ base: prompt }` (without storing prompt_inputs, as before).
  let promptInputs = sanitizePromptInputs(rawPromptInputs);
  const base = promptInputs?.base ?? rawPrompt;
  if (!base || typeof base !== "string") {
    return new Response(JSON.stringify({ error: "Prompt is required" }), { status: 400 });
  }

  const brandRequest = sanitizeBrandRequest(body?.brand);
  if (brandRequest) {
    // A logo is an input image, which only the edit endpoint takes; the panel sends those there.
    if (brandRequest.include.logo) {
      return new Response(JSON.stringify({ error: "Generations with a brand logo go through /api/edit" }), { status: 400 });
    }
    const resolved = await resolveBrand(brandRequest);
    if ("error" in resolved) return new Response(JSON.stringify({ error: resolved.error }), { status: 400 });
    promptInputs = { ...(promptInputs ?? { base }), brand: resolved.input };
  }
  const prompt = promptInputs ? buildPrompt(promptInputs) : base;

  const sizeError = validateSize(size);
  if (sizeError) {
    return new Response(JSON.stringify({ error: sizeError }), { status: 400 });
  }

  const formatError = validateFormatBackground(format, background);
  if (formatError) {
    return new Response(JSON.stringify({ error: formatError }), { status: 400 });
  }
  const isSvg = format === "svg";
  if (isSvg && !supportsSvg(model)) {
    return new Response(JSON.stringify({ error: "SVG output needs a GPT Image 2.6 model" }), { status: 400 });
  }
  const isGif = format === "gif";
  if (isGif && !supportsGif(model)) {
    return new Response(JSON.stringify({ error: "GIF output needs a GPT Image 2.6 model" }), { status: 400 });
  }
  const gif = isGif ? normalizeGif(frameCount, frameDurationMs) : null;
  const gifFields = gif ? gifParams(gif) : {};
  // SVG takes no compression and no background (the author model decides what to draw);
  // GIF takes no custom compression.
  const compression = isSvg || isGif ? null : normalizeCompression(format, rawCompression);
  const backgroundFields = isSvg ? {} : { background };
  const storedBackground = isSvg ? "auto" : background;
  // Shared by the two images of a model comparison; anything that isn't a UUID is ignored.
  const compareGroupId =
    typeof rawCompareGroupId === "string" && UUID_RE.test(rawCompareGroupId) ? rawCompareGroupId : null;

  // OpenAI supports n up to 10, but we cap at 4 to match the UI's n selector.
  // SVG output requires n=1; GIF keeps n=1 to stay inside the per-request pixel budget.
  const count = isSvg || isGif ? 1 : Math.min(Math.max(Number(n) || 1, 1), 4);

  // What is actually sent (empty for 2.5), so the stored value matches the request.
  const complexityFields = complexityParam(model, complexity);

  const openai = getOpenAI();

  const stream = sseStreamFromEvents(async (emit) => {
    // NOTE: OpenAI's streaming image-generation events (`partial_image_index`) only
    // disambiguate progressive partial frames *within a single image* — as of this
    // writing there's no documented/typed field identifying which image of a batch
    // (n > 1) a given streamed event belongs to. Rather than guess at undocumented
    // behavior, batch requests (n > 1) skip streaming/live-preview entirely and use
    // the plain non-streaming call, emitting one "done" event per image as it's
    // persisted so the gallery fills in progressively. n === 1 keeps the original
    // live partial-preview streaming path unchanged.
    // SVG and GIF don't stream, so they take the plain call below even for one image.
    if (count === 1 && !isSvg && !isGif) {
      const partials = preview ? PREVIEW_PARTIALS : 0;
      const t0 = Date.now();
      const events = await openai.images.generate({
        model,
        prompt,
        size,
        quality,
        output_format: format,
        ...(compression != null ? { output_compression: compression } : {}),
        background,
        ...complexityFields,
        n: 1,
        stream: true,
        partial_images: partials,
      });

      let finalB64: string | null = null;
      let lastPartialB64: string | null = null;
      let revisedPrompt: string | null = null;
      let usage: ImageUsage | null = null;
      let reportedSize: unknown = null;
      let durationMs: number | null = null;

      for await (const event of events as AsyncIterable<Record<string, unknown>>) {
        const b64 = (event.b64_json ?? event.partial_image_b64) as string | undefined;
        const idx = (event.partial_image_index ?? 0) as number;
        if (typeof event.revised_prompt === "string") revisedPrompt = event.revised_prompt;

        if (event.type === "image_generation.completed") {
          // Stop the clock on the completed event: that's when the final bytes exist,
          // before any Blob upload / DB insert time is added.
          durationMs = Date.now() - t0;
          if (b64) finalB64 = b64;
          usage = (event.usage as ImageUsage | undefined) ?? null;
          reportedSize = event.size;
          // With preview on, keep showing the final frame while it uploads, as before.
          if (b64 && preview) emit({ type: "partial", index: idx, b64 });
        } else if (b64) {
          lastPartialB64 = b64;
          emit({ type: "partial", index: idx, b64 });
        }
      }

      const b64 = finalB64 ?? lastPartialB64;
      if (!b64) {
        emit({ type: "error", message: "No image data returned from OpenAI" });
        return;
      }
      durationMs ??= Date.now() - t0;
      if (!usage) console.warn("generate: streamed completed event carried no usage");

      const image = await persistGeneratedImage({
        b64,
        prompt,
        revisedPrompt,
        model,
        size: actualSizeOr(size, reportedSize),
        requestedSize: size,
        quality,
        complexity: complexityFields.complexity ?? null,
        format,
        background: storedBackground,
        sourceType: "generate",
        tag,
        previewPartials: partials,
        outputCompression: compression,
        compareGroupId,
        promptInputs,
        durationMs,
        ...usageToFields(usage),
      });

      emit({ type: "done", image, warning: transparencyWarning(image) });
      return;
    }

    const t0 = Date.now();
    const response = await openai.images.generate({
      model,
      prompt,
      size,
      quality,
      output_format: format,
      ...(compression != null ? { output_compression: compression } : {}),
      ...backgroundFields,
      ...complexityFields,
      ...gifFields,
      ...(isSvg ? svgParams() : {}),
      n: count,
      stream: false,
    });

    const durationMs = Date.now() - t0;
    const items = response.data ?? [];
    if (items.length === 0) {
      emit({ type: "error", message: "No image data returned from OpenAI" });
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.b64_json) continue;
      if (isSvg) {
        const reason = unsafeSvgReason(Buffer.from(item.b64_json, "base64").toString("utf-8"));
        if (reason) {
          emit({ type: "error", message: reason });
          continue;
        }
      }
      const image = await persistGeneratedImage({
        b64: item.b64_json,
        prompt,
        revisedPrompt: item.revised_prompt ?? null,
        model,
        size: actualSizeOr(size, response.size),
        requestedSize: size,
        quality,
        complexity: complexityFields.complexity ?? null,
        frameCount: gif?.frameCount ?? null,
        frameDurationMs: gif?.frameDurationMs ?? null,
        format,
        background: storedBackground,
        sourceType: "generate",
        tag,
        previewPartials: 0,
        outputCompression: compression,
        compareGroupId,
        promptInputs,
        durationMs,
        // The response reports usage for the whole request; split it across the images.
        ...usageToFields(response.usage, { count: items.length }),
      });
      emit({ type: "done", image, index: i, total: items.length, warning: transparencyWarning(image) });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
