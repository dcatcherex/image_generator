import { requireUser } from "@/lib/require-user";
import { NextRequest, NextResponse } from "next/server";
import type OpenAI from "openai";
import { getOpenAI, MODEL } from "@/lib/openai";
import { persistGeneratedImage } from "@/lib/save-image";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const denied = await requireUser();
  if (denied) return denied;

  const form = await req.formData();

  const prompt = form.get("prompt");
  const size = (form.get("size") as string) || "1024x1024";
  const quality = (form.get("quality") as string) || "medium";
  const format = (form.get("format") as string) || "png";
  const background = (form.get("background") as string) || "auto";
  const model = (form.get("model") as string) || MODEL[0];
  const referenceImageIds = JSON.parse((form.get("referenceImageIds") as string) || "[]");
  const tag = (form.get("tag") as string) || null;

  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const files = form.getAll("images").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "At least one reference image is required" }, { status: 400 });
  }

  const mask = form.get("mask");
  if (mask instanceof File && files.length !== 1) {
    return NextResponse.json(
      { error: "A mask can only be used with a single reference image" },
      { status: 400 }
    );
  }

  const openai = getOpenAI();

  try {
    const result = await openai.images.edit({
      model,
      image: files.length === 1 ? files[0] : files,
      ...(mask instanceof File ? { mask } : {}),
      prompt,
      size: size as OpenAI.ImageEditParams["size"],
      quality: quality as OpenAI.ImageEditParams["quality"],
      output_format: format as OpenAI.ImageEditParams["output_format"],
      background: background as OpenAI.ImageEditParams["background"],
      n: 1,
      stream: false,
    });

    const b64 = result.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json({ error: "No image data returned from OpenAI" }, { status: 502 });
    }

    const image = await persistGeneratedImage({
      b64,
      prompt,
      revisedPrompt: result.data?.[0]?.revised_prompt ?? null,
      model,
      size,
      quality,
      format,
      background,
      sourceType: "edit",
      referenceImageIds,
      tag,
    });

    return NextResponse.json({ image });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Edit failed" },
      { status: 500 }
    );
  }
}
