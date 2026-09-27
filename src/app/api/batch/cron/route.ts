import { NextRequest, NextResponse } from "next/server";
import { checkAndIngestPendingBatches } from "@/lib/batch-poll";

export const maxDuration = 60;

// Vercel Cron target (see vercel.json's `crons` entry) — the reliability backstop for
// Economy-mode batch jobs, since a batch can take up to 24h and nobody may have the app
// open when it finishes. This route is listed as public in src/proxy.ts (Clerk can't
// authenticate Vercel's cron invocation — it carries no session), so it does its own auth:
// Vercel signs cron requests with `Authorization: Bearer $CRON_SECRET`, which must be set
// as an env var on the Vercel project (see PLAN.md). Reject anything else.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (!secret) {
    // Fail closed: if CRON_SECRET isn't configured, refuse rather than run unauthenticated.
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await checkAndIngestPendingBatches();
  return NextResponse.json(result);
}
