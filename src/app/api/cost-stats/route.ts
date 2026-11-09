import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { images } from "@/db/schema";
import { costStatsKey, type CostStats } from "@/lib/pricing";

export async function GET() {
  // Requiring duration_ms drops batch rows (they never get one), so their 50%-discounted
  // costs can't skew the instant-mode medians. Grouped by requested_size because that's
  // what's known before generating. Complexity (2.6 only) is part of the key since it can
  // change how many tokens the model spends.
  const rows = await getDb()
    .select({
      model: images.model,
      quality: images.quality,
      complexity: images.complexity,
      requestedSize: images.requestedSize,
      median: sql<number>`percentile_cont(0.5) within group (order by ${images.actualCost}::float8)`,
      count: sql<number>`count(*)::int`,
    })
    .from(images)
    .where(sql`${images.actualCost} is not null and ${images.durationMs} is not null and ${images.requestedSize} is not null`)
    .groupBy(images.model, images.quality, images.requestedSize, images.complexity);

  const stats: CostStats = {};
  for (const r of rows) {
    stats[costStatsKey(r.model, r.quality, r.requestedSize!, r.complexity)] = { median: Number(r.median), count: Number(r.count) };
  }
  return NextResponse.json(stats);
}
