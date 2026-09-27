import { NextResponse } from "next/server";
import { checkAndIngestPendingBatches } from "@/lib/batch-poll";

export const maxDuration = 60;

// Client-triggered poll for responsiveness while a tab is open (called every 30-60s from
// page.tsx while there are pending batch jobs). The Vercel Cron hitting /api/batch/cron is
// the reliability backstop that keeps working even when nobody has the app open — this route
// is purely a "check sooner" convenience and does the exact same work.
export async function POST() {
  const result = await checkAndIngestPendingBatches();
  return NextResponse.json(result);
}
