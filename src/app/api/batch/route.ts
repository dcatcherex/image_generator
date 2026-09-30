import { requireUser } from "@/lib/require-user";
import { NextResponse } from "next/server";
import { notInArray } from "drizzle-orm";
import { getDb } from "@/db";
import { batchJobs } from "@/db/schema";
import { TERMINAL_BATCH_STATUSES } from "@/lib/batch";

// Lists non-terminal batch jobs only — once a job is "ingested" (or failed/expired/
// cancelled with nothing usable), its images already exist in the normal /api/images list
// or there's nothing to show, so the gallery has no more use for the batch_jobs row.
export async function GET() {
  const denied = await requireUser();
  if (denied) return denied;

  const db = getDb();
  const rows = await db
    .select()
    .from(batchJobs)
    .where(notInArray(batchJobs.status, [...TERMINAL_BATCH_STATUSES]));

  return NextResponse.json({
    jobs: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  });
}
