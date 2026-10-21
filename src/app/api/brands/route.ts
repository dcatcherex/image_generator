import { requireOwner } from "@/lib/require-owner";
import { NextRequest, NextResponse } from "next/server";
import { asc, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { brands } from "@/db/schema";
import {
  rowToBrandRecord,
  sanitizeBrandKit,
  sanitizeBrandLanguage,
  sanitizeBrandName,
} from "@/lib/brands";
import { parseDesignMd } from "@/lib/brand-design-md";

// Brands are owner-only data, so unlike /api/images even reads require the owner.
export async function GET(req: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;

  const includeArchived = new URL(req.url).searchParams.get("archived") === "true";
  const rows = await getDb()
    .select()
    .from(brands)
    .where(includeArchived ? undefined : isNull(brands.archivedAt))
    .orderBy(asc(brands.name));

  return NextResponse.json({ brands: rows.map(rowToBrandRecord) });
}

export async function POST(req: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;

  // `{ markdown }` imports a DESIGN.md; explicit fields (e.g. a renamed `name`) win over it.
  const body = await req.json().catch(() => null);
  const imported = typeof body?.markdown === "string" ? parseDesignMd(body.markdown) : null;
  const name = sanitizeBrandName(body?.name ?? imported?.name);
  if (!name) return NextResponse.json({ error: "Brand name is required" }, { status: 400 });

  const [row] = await getDb()
    .insert(brands)
    .values({
      name,
      kit: sanitizeBrandKit(body?.kit, imported?.kit),
      language: sanitizeBrandLanguage(body?.language ?? imported?.language),
    })
    .returning();

  return NextResponse.json({ brand: rowToBrandRecord(row) }, { status: 201 });
}
