import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { getOpenAI } from "@/lib/openai";
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
    referenceCount: Math.max(0, Math.min(16, Number(body?.referenceCount) || 0)),
  };

  try {
    const response = await getOpenAI().responses.create({
      model: assistModel(),
      instructions: assistInstructions(request),
      input: assistInput(request),
    });
    const text = cleanAssistOutput(response.output_text ?? "");
    if (!text) return NextResponse.json({ error: "The model returned an empty prompt" }, { status: 502 });
    return NextResponse.json({ prompt: text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Prompt assist failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
