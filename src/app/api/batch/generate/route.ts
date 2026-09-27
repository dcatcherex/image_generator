import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { toFile } from "openai";
import { getOpenAI, MODEL } from "@/lib/openai";
import { getDb } from "@/db";
import { batchJobs } from "@/db/schema";
import { buildBatchJsonl, type BatchRequestMeta } from "@/lib/batch";

export const maxDuration = 60;

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
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  // Same conservative cap as the instant-generate n selector (see src/lib/openai.ts
  // N_OPTIONS) — Economy mode reuses that same control in the UI, so keep them in sync.
  const count = Math.min(Math.max(Number(n) || 1, 1), 4);

  const requests: BatchRequestMeta[] = Array.from({ length: count }, () => ({
    customId: randomUUID(),
    prompt,
    size,
    quality,
    format,
    background,
    model,
    tag,
  }));

  const openai = getOpenAI();

  try {
    const jsonl = buildBatchJsonl(requests);
    const file = await openai.files.create({
      file: await toFile(Buffer.from(jsonl, "utf-8"), "batch.jsonl", {
        type: "application/jsonl",
      }),
      purpose: "batch",
    });

    const batch = await openai.batches.create({
      input_file_id: file.id,
      endpoint: "/v1/images/generations",
      completion_window: "24h",
    });

    const db = getDb();
    const [row] = await db
      .insert(batchJobs)
      .values({
        openaiBatchId: batch.id,
        inputFileId: file.id,
        outputFileId: batch.output_file_id ?? null,
        errorFileId: batch.error_file_id ?? null,
        status: batch.status,
        requestCount: count,
        completedCount: batch.request_counts?.completed ?? 0,
        failedCount: batch.request_counts?.failed ?? 0,
        requests,
      })
      .returning();

    return NextResponse.json({
      job: { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Batch submission failed" },
      { status: 500 }
    );
  }
}
