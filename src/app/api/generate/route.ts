import { NextRequest } from "next/server";
import { getOpenAI, MODEL } from "@/lib/openai";
import { persistGeneratedImage } from "@/lib/save-image";
import { sseStreamFromEvents } from "@/lib/sse";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
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
  } = body ?? {};

  if (!prompt || typeof prompt !== "string") {
    return new Response(JSON.stringify({ error: "Prompt is required" }), { status: 400 });
  }

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
      const events = await openai.images.generate({
        model,
        prompt,
        size,
        quality,
        output_format: format,
        background,
        n: 1,
        stream: true,
        partial_images: 2,
      });

      let lastB64: string | null = null;
      let revisedPrompt: string | null = null;

      for await (const event of events as AsyncIterable<Record<string, unknown>>) {
        const b64 = (event.b64_json ?? event.partial_image_b64) as string | undefined;
        const idx = (event.partial_image_index ?? 0) as number;
        if (typeof event.revised_prompt === "string") revisedPrompt = event.revised_prompt;
        if (b64) {
          lastB64 = b64;
          emit({ type: "partial", index: idx, b64 });
        }
      }

      if (!lastB64) {
        emit({ type: "error", message: "No image data returned from OpenAI" });
        return;
      }

      const image = await persistGeneratedImage({
        b64: lastB64,
        prompt,
        revisedPrompt,
        model,
        size,
        quality,
        format,
        background,
        sourceType: "generate",
        tag,
      });

      emit({ type: "done", image });
      return;
    }

    const response = await openai.images.generate({
      model,
      prompt,
      size,
      quality,
      output_format: format,
      background,
      n: count,
      stream: false,
    });

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
        size,
        quality,
        format,
        background,
        sourceType: "generate",
        tag,
      });
      emit({ type: "done", image, index: i, total: items.length });
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
