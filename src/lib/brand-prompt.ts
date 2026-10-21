import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { brands } from "@/db/schema";
import { rowToBrandRecord, type BrandLogo } from "./brands";
import { brandSnapshot, type BrandPromptInput, type BrandRequest } from "./prompt-builder";

// Server half of brand-aware generation: turns the client's { id, include } into the prompt
// snapshot (from the stored brand, never client-sent kit content) and, when the Logo chip is
// on, the logo file to append to the edit request's references.

export type ResolvedBrand = {
  input: BrandPromptInput;
  /** The chosen logo variant as a file for the edit endpoint, when include.logo is on. */
  logo: File | null;
};

export async function resolveBrand(request: BrandRequest): Promise<ResolvedBrand | { error: string }> {
  const [row] = await getDb().select().from(brands).where(eq(brands.id, request.id));
  if (!row) return { error: "Brand not found" };
  const brand = rowToBrandRecord(row);

  let logo: File | null = null;
  let logoVariant: BrandLogo["variant"] | undefined;
  if (request.include.logo) {
    const chosen =
      brand.logos.find((l) => l.variant === request.logoVariant) ??
      brand.logos.find((l) => l.variant === "primary") ??
      brand.logos[0];
    if (!chosen) return { error: `${brand.name} has no logo yet — upload one in Manage brands, or turn the Logo chip off` };
    const res = await fetch(chosen.blobUrl);
    if (!res.ok) return { error: "Couldn't load the brand logo" };
    const type = res.headers.get("content-type") ?? "image/png";
    const ext = chosen.blobPathname.split(".").pop() ?? "png";
    logo = new File([await res.arrayBuffer()], `logo-${chosen.variant}.${ext}`, { type });
    logoVariant = chosen.variant;
  }

  return {
    input: {
      id: brand.id,
      name: brand.name,
      section: brandSnapshot(brand.kit, brand.language, request.include),
      include: request.include,
      ...(logoVariant ? { logoVariant } : {}),
    },
    logo,
  };
}
