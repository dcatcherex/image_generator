import { requireUser } from "@/lib/require-user";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { del } from "@vercel/blob";
import { getDb } from "@/db";
import { images } from "@/db/schema";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireUser();
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json();
  const db = getDb();

  const updates: Partial<typeof images.$inferInsert> = {};
  if ("favorite" in body) updates.favorite = Boolean(body.favorite);
  if ("tag" in body) {
    // null/empty clears the tag; ASSIGNABLE_TAGS validation happens client-side (fixed
    // select), so we just trust the value here rather than re-importing the list server-side.
    updates.tag = body.tag ? String(body.tag) : null;
  }

  const [row] = await db
    .update(images)
    .set(updates)
    .where(eq(images.id, id))
    .returning();

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ image: { ...row, createdAt: row.createdAt.toISOString() } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireUser();
  if (denied) return denied;

  const { id } = await params;
  const db = getDb();

  const [row] = await db.delete(images).where(eq(images.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await del(row.blobUrl).catch(() => {});

  return NextResponse.json({ ok: true });
}
