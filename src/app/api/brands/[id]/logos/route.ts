import { requireOwner } from "@/lib/require-owner";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { del, put } from "@vercel/blob";
import { randomUUID } from "crypto";
import { getDb } from "@/db";
import { brands } from "@/db/schema";
import { isLogoVariant, isUuid, rowToBrandRecord, type BrandLogo } from "@/lib/brands";

// Logos are sent to the edit endpoint as reference images, so only formats it accepts.
const LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/webp": "webp",
};
// Under Vercel's 4.5 MB request body limit, leaving room for the multipart envelope.
const MAX_LOGO_BYTES = 4 * 1024 * 1024;

// multipart: `variant` (primary | on-dark | icon) + `file`. Replaces that variant if present.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const variant = form.get("variant");
  const file = form.get("file");
  if (!isLogoVariant(variant)) return NextResponse.json({ error: "Invalid logo variant" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  const ext = LOGO_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Logo must be PNG, JPEG or WebP" }, { status: 400 });
  if (file.size > MAX_LOGO_BYTES) return NextResponse.json({ error: "Logo must be under 4 MB" }, { status: 400 });

  const db = getDb();
  const [existing] = await db.select().from(brands).where(eq(brands.id, id));
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pathname = `brands/${id}/${variant}-${randomUUID()}.${ext}`;
  const blob = await put(pathname, Buffer.from(await file.arrayBuffer()), {
    access: "public",
    contentType: file.type,
  });

  const replaced = existing.logos.find((l) => l.variant === variant);
  const logos: BrandLogo[] = [
    ...existing.logos.filter((l) => l.variant !== variant),
    { variant, blobUrl: blob.url, blobPathname: pathname },
  ];
  const [row] = await db
    .update(brands)
    .set({ logos, updatedAt: new Date() })
    .where(eq(brands.id, id))
    .returning();

  if (replaced) await del(replaced.blobUrl).catch(() => {});

  return NextResponse.json({ brand: rowToBrandRecord(row) });
}

// `?variant=<variant>` removes that logo.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const variant = new URL(req.url).searchParams.get("variant");
  if (!isLogoVariant(variant)) return NextResponse.json({ error: "Invalid logo variant" }, { status: 400 });

  const db = getDb();
  const [existing] = await db.select().from(brands).where(eq(brands.id, id));
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const removed = existing.logos.find((l) => l.variant === variant);
  if (!removed) return NextResponse.json({ brand: rowToBrandRecord(existing) });

  const [row] = await db
    .update(brands)
    .set({ logos: existing.logos.filter((l) => l.variant !== variant), updatedAt: new Date() })
    .where(eq(brands.id, id))
    .returning();
  await del(removed.blobUrl).catch(() => {});

  return NextResponse.json({ brand: rowToBrandRecord(row) });
}
