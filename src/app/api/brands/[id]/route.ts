import { requireOwner } from "@/lib/require-owner";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { del } from "@vercel/blob";
import { getDb } from "@/db";
import { brands, images } from "@/db/schema";
import {
  EMPTY_BRAND_KIT,
  isUuid,
  rowToBrandRecord,
  sanitizeBrandKit,
  sanitizeBrandLanguage,
  sanitizeBrandName,
} from "@/lib/brands";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [row] = await getDb().select().from(brands).where(eq(brands.id, id));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ brand: rowToBrandRecord(row) });
}

// Partial update. `kit` fields merge into the stored kit; `archived: true|false` archives or
// restores (archiving is the normal "delete" — see DELETE for the permanent one).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const db = getDb();
  const [existing] = await db.select().from(brands).where(eq(brands.id, id));
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: Partial<typeof brands.$inferInsert> = { updatedAt: new Date() };
  if ("name" in body) {
    const name = sanitizeBrandName(body.name);
    if (!name) return NextResponse.json({ error: "Brand name is required" }, { status: 400 });
    updates.name = name;
  }
  if ("kit" in body) updates.kit = sanitizeBrandKit(body.kit, { ...EMPTY_BRAND_KIT, ...existing.kit });
  if ("language" in body) updates.language = sanitizeBrandLanguage(body.language);
  if ("archived" in body) updates.archivedAt = body.archived ? (existing.archivedAt ?? new Date()) : null;

  const [row] = await db.update(brands).set(updates).where(eq(brands.id, id)).returning();
  return NextResponse.json({ brand: rowToBrandRecord(row) });
}

// Archives by default, so a client you stopped working with keeps its image history.
// `?permanent=true` removes the brand and its logos and unbrands its images; their
// prompt_inputs snapshots stay as a record of what was used.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = getDb();

  if (new URL(req.url).searchParams.get("permanent") !== "true") {
    const [row] = await db
      .update(brands)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(brands.id, id))
      .returning();
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ brand: rowToBrandRecord(row) });
  }

  // neon-http has no transactions. Unbrand first so a failure part-way never leaves images
  // pointing at a brand that no longer exists.
  await db.update(images).set({ brandId: null }).where(eq(images.brandId, id));
  const [row] = await db.delete(brands).where(eq(brands.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await Promise.all((row.logos ?? []).map((logo) => del(logo.blobUrl).catch(() => {})));

  return NextResponse.json({ ok: true });
}
