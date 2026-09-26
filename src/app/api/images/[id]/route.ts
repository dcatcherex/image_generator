import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { del } from "@vercel/blob";
import { getDb } from "@/db";
import { images } from "@/db/schema";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = getDb();

  const [row] = await db
    .update(images)
    .set({ favorite: Boolean(body.favorite) })
    .where(eq(images.id, id))
    .returning();

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ image: { ...row, createdAt: row.createdAt.toISOString() } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const [row] = await db.delete(images).where(eq(images.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await del(row.blobUrl).catch(() => {});

  return NextResponse.json({ ok: true });
}
