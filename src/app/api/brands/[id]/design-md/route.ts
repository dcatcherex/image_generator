import { requireOwner } from "@/lib/require-owner";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { brands } from "@/db/schema";
import { isUuid, rowToBrandRecord } from "@/lib/brands";
import { brandToDesignMd } from "@/lib/brand-design-md";

// Downloads the brand as DESIGN.md. Logos are binary, so they stay out of the export.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [row] = await getDb().select().from(brands).where(eq(brands.id, id));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const brand = rowToBrandRecord(row);
  // Brand names are often Thai, so the filename needs the RFC 5987 form; the plain one is an
  // ASCII fallback for clients that ignore filename*.
  const filename = `${brand.name} DESIGN.md`;
  return new NextResponse(brandToDesignMd(brand), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="DESIGN.md"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
