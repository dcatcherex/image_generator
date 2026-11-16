import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { getOpenAI } from "@/lib/openai";
import { sanitizePromptInputs } from "@/lib/prompt-builder";
import {
  ASSIST_MODES,
  assistInput,
  assistInstructions,
  assistModel,
  cleanAssistOutput,
  type AssistMode,
} from "@/lib/prompt-assist";

export const maxDuration = 120;

const MAX_PROMPT = 20_000;
const MAX_CONTEXT = 4_000;
// Reference images arrive downscaled by the client (~1024px JPEG, ~100-300 KB each).
const MAX_IMAGES = 8;
const MAX_IMAGE_CHARS = 3_000_000;
const DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

function sanitizeImages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string" && x.length <= MAX_IMAGE_CHARS && DATA_URL.test(x))
    .slice(0, MAX_IMAGES);
}

export async function POST(req: NextRequest) {
  // Spends money on a text model, so owner-only like the image routes.
  const denied = await requireOwner();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const mode = body?.mode as AssistMode;
  if (!ASSIST_MODES.includes(mode)) {
    return NextResponse.json({ error: "Unknown assist mode" }, { status: 400 });
  }
  const prompt = typeof body?.prompt === "string" ? body.prompt.slice(0, MAX_PROMPT) : "";
  const context = typeof body?.context === "string" ? body.context.slice(0, MAX_CONTEXT) : "";
  if (!prompt.trim() && !context.trim()) {
    return NextResponse.json({ error: "Write a prompt or some context first" }, { status: 400 });
  }
  if (mode !== "write" && !prompt.trim()) {
    return NextResponse.json({ error: "The prompt is empty" }, { status: 400 });
  }

  const request = {
    mode,
    prompt,
    context,
    isEdit: Boolean(body?.isEdit),
    language: typeof body?.language === "string" && body.language.trim() ? body.language.trim() : null,
    // Reuse the generate routes' validation of role/note entries.
    references: (sanitizePromptInputs({ base: "-", referenceRoles: body?.references })?.referenceRoles ?? []).slice(0, 16),
    hasMarkup: Boolean(body?.hasMarkup),
    images: sanitizeImages(body?.images),
  };

  try {
    const inputText = assistInput(request);
    const response = await getOpenAI().responses.create({
      model: assistModel(),
      instructions: assistInstructions(request),
      input:
        request.images.length === 0
          ? inputText
          : [
              {
                role: "user",
                content: [
                  { type: "input_text", text: inputText },
                  ...request.images.map((url) => ({ type: "input_image" as const, image_url: url, detail: "auto" as const })),
                ],
              },
            ],
    });
    const text = cleanAssistOutput(response.output_text ?? "");
    if (!text) return NextResponse.json({ error: "The model returned an empty prompt" }, { status: 502 });
    return NextResponse.json({ prompt: text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Prompt assist failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
