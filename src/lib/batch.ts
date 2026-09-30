// Shared types/helpers for "Economy mode" — OpenAI's real async Batch API (~50% cheaper,
// results within up to 24h, no guarantee of speed). This is a separate, opt-in path from
// the normal instant `/api/generate` flow; it never touches that flow's code.

import type { ImageUsage } from "./pricing";
import type { PromptInputs } from "./prompt-builder";

export type BatchRequestMeta = {
  customId: string;
  prompt: string;
  size: string;
  quality: string;
  format: string;
  background: string;
  model: string;
  tag: string | null;
  // Optional for jobs submitted before these existed (stored in the batch_jobs.requests jsonb).
  compression?: number | null;
  promptInputs?: PromptInputs | null;
};

// Terminal statuses that mean "nothing left to do" for a batch row — either its images
// have already been persisted ("ingested"), or the batch ended without usable output.
export const TERMINAL_BATCH_STATUSES = ["ingested", "failed", "expired", "cancelled"] as const;

/** Builds the .jsonl body for OpenAI's Batch API, one line per requested image. */
export function buildBatchJsonl(requests: BatchRequestMeta[]): string {
  return requests
    .map((r) =>
      JSON.stringify({
        custom_id: r.customId,
        method: "POST",
        url: "/v1/images/generations",
        body: {
          model: r.model,
          prompt: r.prompt,
          size: r.size,
          quality: r.quality,
          output_format: r.format,
          background: r.background,
          n: 1,
        },
      })
    )
    .join("\n");
}

// Shape of each line in the batch output .jsonl OpenAI hands back, per their docs. Order of
// lines in the output file is NOT guaranteed to match the input file — always correlate by
// custom_id, never by position.
export type BatchOutputLine = {
  id: string;
  custom_id: string;
  response: {
    status_code: number;
    request_id: string;
    body?: {
      data?: Array<{ b64_json?: string; revised_prompt?: string }>;
      // Actual returned dimensions (differs from the request when size was "auto").
      size?: string;
      usage?: ImageUsage;
    };
  } | null;
  error: { code?: string; message?: string } | null;
};

export function parseBatchOutputJsonl(text: string): BatchOutputLine[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as BatchOutputLine;
      } catch {
        return null;
      }
    })
    .filter((v): v is BatchOutputLine => v !== null);
}
