import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike } from "drizzle-orm";
import { getDb } from "@/db";
import { images } from "@/db/schema";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const favoritesOnly = searchParams.get("favorites") === "true";

  const db = getDb();
  const conditions = [];
  if (q) conditions.push(ilike(images.prompt, `%${q}%`));
  if (favoritesOnly) conditions.push(eq(images.favorite, true));

  const rows = await db
    .select()
    .from(images)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(images.createdAt))
    .limit(200);

  return NextResponse.json({
    images: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
  });
}
