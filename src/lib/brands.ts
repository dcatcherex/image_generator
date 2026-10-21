import type { BrandRow } from "@/db/schema";

// Brand kits (BRANDS.md). A brand is owner-only data: every brand route calls requireOwner(),
// including reads, and image responses strip brand fields for public viewers.

export type BrandColor = { hex: string; role: string; note?: string };

/** The structured part of a brand, stored as one jsonb so fields can evolve without migrations. */
export type BrandKit = {
  colors: BrandColor[];
  typeFeel: string; // described, since image models can't use real fonts
  style: string;
  dos: string[];
  donts: string[];
  standingText: string; // contact info etc., rendered verbatim when its chip is on
  notes: string;
};

export const LOGO_VARIANTS = ["primary", "on-dark", "icon"] as const;
export type LogoVariant = (typeof LOGO_VARIANTS)[number];

export type BrandLogo = { variant: LogoVariant; blobUrl: string; blobPathname: string };

export type BrandRecord = {
  id: string;
  name: string;
  kit: BrandKit;
  language: string;
  logos: BrandLogo[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const EMPTY_BRAND_KIT: BrandKit = {
  colors: [],
  typeFeel: "",
  style: "",
  dos: [],
  donts: [],
  standingText: "",
  notes: "",
};

export const DEFAULT_BRAND_LANGUAGE = "Thai";

const MAX_COLORS = 12;
const MAX_LIST = 20;
const HEX = /^#[0-9a-f]{6}$/i;

export function rowToBrandRecord(row: BrandRow): BrandRecord {
  return {
    id: row.id,
    name: row.name,
    kit: { ...EMPTY_BRAND_KIT, ...row.kit },
    language: row.language,
    logos: row.logos ?? [],
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function strList(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => str(x, max)).filter(Boolean).slice(0, MAX_LIST);
}

/** Validates an untrusted (partial) kit, falling back to `base` for absent fields. */
export function sanitizeBrandKit(raw: unknown, base: BrandKit = EMPTY_BRAND_KIT): BrandKit {
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const kit = { ...base };
  if ("colors" in r) {
    kit.colors = (Array.isArray(r.colors) ? r.colors : [])
      .map((c): BrandColor | null => {
        const e = (c ?? {}) as Record<string, unknown>;
        const hex = str(e.hex, 7);
        if (!HEX.test(hex)) return null;
        const note = str(e.note, 200);
        return { hex: hex.toUpperCase(), role: str(e.role, 60), ...(note ? { note } : {}) };
      })
      .filter((c): c is BrandColor => c !== null)
      .slice(0, MAX_COLORS);
  }
  if ("typeFeel" in r) kit.typeFeel = str(r.typeFeel, 500);
  if ("style" in r) kit.style = str(r.style, 1000);
  if ("dos" in r) kit.dos = strList(r.dos, 200);
  if ("donts" in r) kit.donts = strList(r.donts, 200);
  if ("standingText" in r) kit.standingText = str(r.standingText, 1000);
  if ("notes" in r) kit.notes = str(r.notes, 4000);
  return kit;
}

export function sanitizeBrandName(raw: unknown): string | null {
  const name = str(raw, 80);
  return name || null;
}

export function sanitizeBrandLanguage(raw: unknown): string {
  return str(raw, 40) || DEFAULT_BRAND_LANGUAGE;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids reach Postgres uuid columns, where a malformed value throws instead of matching nothing. */
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

export function isLogoVariant(v: unknown): v is LogoVariant {
  return typeof v === "string" && (LOGO_VARIANTS as readonly string[]).includes(v);
}
