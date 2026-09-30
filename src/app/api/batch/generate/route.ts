import { requireUser } from "@/lib/require-user";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { toFile } from "openai";
import { getOpenAI, MODEL, validateSize } from "@/lib/openai";
import { getDb } from "@/db";
import { batchJobs } from "@/db/schema";
import { buildBatchJsonl, type BatchRequestMeta } from "@/lib/batch";

export const maxDuration = 60;

// One entry per queued prompt from the UI's "Prompt queue" — each can carry its own
// settings and its own repeat count `n`, unlike a single generate/edit request.
type QueuedRequest = {
  prompt: unknown;
  size?: string;
  quality?: string;
  format?: string;
  background?: string;
  model?: string;
  n?: number;
  tag?: string | null;
};

export async function POST(req: NextRequest) {
  const denied = await requireUser();
  if (denied) return denied;

  const body = await req.json();
  const queued: QueuedRequest[] = Array.isArray(body?.requests) ? body.requests : [];

  const requests: BatchRequestMeta[] = [];
  for (const item of queued) {
    if (!item.prompt || typeof item.prompt !== "string") continue;
    const sizeError = validateSize(item.size || "1024x1024");
    if (sizeError) return NextResponse.json({ error: sizeError }, { status: 400 });
    // Same conservative cap as the instant-generate n selector (see src/lib/openai.ts
    // N_OPTIONS) — Economy mode reuses that same control in the UI, so keep them in sync.
    const count = Math.min(Math.max(Number(item.n) || 1, 1), 4);
    for (let i = 0; i < count; i++) {
      requests.push({
        customId: randomUUID(),
        prompt: item.prompt,
        size: item.size || "1024x1024",
        quality: item.quality || "medium",
        format: item.format || "png",
        background: item.background || "auto",
        model: item.model || MODEL[0],
        tag: item.tag ?? null,
      });
    }
  }

  if (requests.length === 0) {
    return NextResponse.json({ error: "At least one prompt is required" }, { status: 400 });
  }

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
        requestCount: requests.length,
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
