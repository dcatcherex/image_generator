import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { images } from "@/db/schema";
import { publicImageRecord, rowToImageRecord } from "@/lib/image-record";
import { isOwner } from "@/lib/require-owner";
import { isUuid } from "@/lib/brands";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const favoritesOnly = searchParams.get("favorites") === "true";
  const tag = searchParams.get("tag")?.trim();
  // A brand id, or "none" for unbranded. Owner-only, so public viewers can't probe brands.
  const brand = searchParams.get("brand")?.trim();
  const owner = await isOwner();

  const db = getDb();
  const conditions = [];
  if (q) conditions.push(ilike(images.prompt, `%${q}%`));
  if (favoritesOnly) conditions.push(eq(images.favorite, true));
  if (tag) conditions.push(eq(images.tag, tag));
  if (owner && brand) {
    if (brand === "none") conditions.push(isNull(images.brandId));
    else if (isUuid(brand)) conditions.push(eq(images.brandId, brand));
  }

  const rows = await db
    .select()
    .from(images)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(images.createdAt))
    .limit(200);

  return NextResponse.json({
    images: rows.map((row) => {
      const record = rowToImageRecord(row);
      return owner ? record : publicImageRecord(record);
    }),
  });
}
