import { requireUser } from "@/lib/require-user";
import { NextRequest } from "next/server";
import { getOpenAI, MODEL, normalizeCompression, validateFormatBackground, validateSize } from "@/lib/openai";
import { persistGeneratedImage, transparencyWarning } from "@/lib/save-image";
import { sseStreamFromEvents } from "@/lib/sse";
import { actualSizeOr, usageToFields, type ImageUsage } from "@/lib/pricing";

// Streamed partial images requested when live preview is on (each bills 100 output tokens).
const PREVIEW_PARTIALS = 2;

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const denied = await requireUser();
  if (denied) return denied;

  const body = await req.json();
  const {
    prompt,
    size = "1024x1024",
    quality = "medium",
    format = "png",
    background = "auto",
    model = MODEL[0],
    n = 1,
    tag = null,
    preview = false,
    compression: rawCompression = null,
  } = body ?? {};

  if (!prompt || typeof prompt !== "string") {
    return new Response(JSON.stringify({ error: "Prompt is required" }), { status: 400 });
  }

  const sizeError = validateSize(size);
  if (sizeError) {
    return new Response(JSON.stringify({ error: sizeError }), { status: 400 });
  }

  const formatError = validateFormatBackground(format, background);
  if (formatError) {
    return new Response(JSON.stringify({ error: formatError }), { status: 400 });
  }
  const compression = normalizeCompression(format, rawCompression);

  // OpenAI supports n up to 10, but we cap at 4 to match the UI's n selector.
  const count = Math.min(Math.max(Number(n) || 1, 1), 4);

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
    if (count === 1) {
      const partials = preview ? PREVIEW_PARTIALS : 0;
      const t0 = Date.now();
      const events = await openai.images.generate({
        model,
        prompt,
        size,
        quality,
        output_format: format,
      ...(compression != null ? { output_compression: compression } : {}),
        ...(compression != null ? { output_compression: compression } : {}),
        background,
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
        format,
        background,
        sourceType: "generate",
        tag,
        previewPartials: partials,
        outputCompression: compression,
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
      background,
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
      const image = await persistGeneratedImage({
        b64: item.b64_json,
        prompt,
        revisedPrompt: item.revised_prompt ?? null,
        model,
        size: actualSizeOr(size, response.size),
        requestedSize: size,
        quality,
        format,
        background,
        sourceType: "generate",
        tag,
        previewPartials: 0,
        outputCompression: compression,
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
