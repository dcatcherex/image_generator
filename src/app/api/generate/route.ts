import { NextRequest } from "next/server";
import { getOpenAI, MODELS } from "@/lib/openai";
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
    model = MODELS.generate,
  } = body ?? {};

  if (!prompt || typeof prompt !== "string") {
    return new Response(JSON.stringify({ error: "Prompt is required" }), { status: 400 });
  }

  const openai = getOpenAI();

  const stream = sseStreamFromEvents(async (emit) => {
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
    });

    emit({ type: "done", image });
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
