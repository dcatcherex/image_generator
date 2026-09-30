import { notInArray, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { batchJobs } from "@/db/schema";
import { getOpenAI } from "@/lib/openai";
import { persistGeneratedImage } from "@/lib/save-image";
import { actualSizeOr, usageToFields } from "@/lib/pricing";
import { TERMINAL_BATCH_STATUSES, parseBatchOutputJsonl } from "@/lib/batch";

/**
 * Checks every non-terminal batch_jobs row against OpenAI, updates status/counts, and — the
 * first time a job shows up as "completed" — ingests its output file into real `images` rows
 * (persistGeneratedImage, same as the instant generate/edit routes use), then flips the row to
 * our own "ingested" status so later polls never double-persist.
 *
 * Called from two places: the Vercel Cron route (reliability backstop — runs even if nobody
 * has the app open) and a client-triggered poll route (for responsiveness while a tab is open).
 * Both just call this; it's safe to call concurrently/repeatedly since ingestion only happens
 * once per job (guarded by the "completed" -> "ingested" status transition).
 */
export async function checkAndIngestPendingBatches(): Promise<{
  checked: number;
  ingested: number;
}> {
  const db = getDb();
  const openai = getOpenAI();

  const pending = await db
    .select()
    .from(batchJobs)
    .where(notInArray(batchJobs.status, [...TERMINAL_BATCH_STATUSES]));

  let ingestedCount = 0;

  for (const job of pending) {
    let remote;
    try {
      remote = await openai.batches.retrieve(job.openaiBatchId);
    } catch (err) {
      console.error(`batch-poll: failed to retrieve ${job.openaiBatchId}`, err);
      continue;
    }

    const updates: Partial<typeof batchJobs.$inferInsert> = {
      status: remote.status,
      outputFileId: remote.output_file_id ?? job.outputFileId,
      errorFileId: remote.error_file_id ?? job.errorFileId,
      completedCount: remote.request_counts?.completed ?? job.completedCount,
      failedCount: remote.request_counts?.failed ?? job.failedCount,
      updatedAt: new Date(),
    };

    if (remote.status === "completed") {
      if (!remote.output_file_id) {
        // Completed with nothing to ingest (e.g. every line failed and only an error file
        // exists) — nothing to persist, just mark done so we stop polling it.
        updates.status = "ingested";
      } else {
        try {
          const fileResponse = await openai.files.content(remote.output_file_id);
          const text = await fileResponse.text();
          const lines = parseBatchOutputJsonl(text);
          const requestsById = new Map(job.requests.map((r) => [r.customId, r]));

          let succeeded = 0;
          let failed = 0;

          for (const line of lines) {
            const meta = requestsById.get(line.custom_id);
            if (!meta) {
              console.error(`batch-poll: job ${job.id} got unknown custom_id ${line.custom_id}`);
              continue;
            }

            const b64 = line.response?.body?.data?.[0]?.b64_json;
            if (!b64) {
              failed++;
              console.error(
                `batch-poll: job ${job.id} request ${line.custom_id} failed`,
                line.error ?? line.response?.body
              );
              continue;
            }

            try {
              await persistGeneratedImage({
                b64,
                prompt: meta.prompt,
                revisedPrompt: line.response?.body?.data?.[0]?.revised_prompt ?? null,
                model: meta.model,
                size: actualSizeOr(meta.size, line.response?.body?.size),
                requestedSize: meta.size,
                quality: meta.quality,
                format: meta.format,
                background: meta.background,
                sourceType: "generate",
                tag: meta.tag,
                previewPartials: 0,
                outputCompression: meta.compression ?? null,
                // No duration for batch rows: queue time isn't generation time, and a null
                // duration_ms is what keeps their discounted costs out of cost-stats.
                ...usageToFields(line.response?.body?.usage, { batch: true }),
              });
              succeeded++;
            } catch (err) {
              failed++;
              console.error(`batch-poll: job ${job.id} failed to persist ${line.custom_id}`, err);
            }
          }

          updates.status = "ingested";
          updates.completedCount = succeeded;
          updates.failedCount = failed;
          ingestedCount++;
        } catch (err) {
          // Leave status as "completed" (not "ingested") so the next poll retries — don't
          // silently drop a batch's results because of a transient fetch/parse failure.
          console.error(`batch-poll: job ${job.id} failed to fetch/parse output file`, err);
          updates.status = "completed";
        }
      }
    }

    await db.update(batchJobs).set(updates).where(eq(batchJobs.id, job.id));
  }

  return { checked: pending.length, ingested: ingestedCount };
}
