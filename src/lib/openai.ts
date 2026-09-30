import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getOpenAI() {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

export const MODEL = ["gpt-image-2.5-sunburst", "gpt-image-2.5-flare"] as const;

export type ImageModel = (typeof MODEL)[number];

export const QUALITY_OPTIONS = ["auto", "low", "medium", "high", "xhigh", "max"] as const;

// The GPT image models accept arbitrary WIDTHxHEIGHT sizes (must be divisible by 16, aspect
// ratio between 1:3 and 3:1), so rather than a fixed size list we offer aspect ratios and
// compute a concrete size for each at the chosen size tier.
export const ASPECT_RATIOS = [
  { label: "Auto", ratio: null },
  { label: "1:1", ratio: [1, 1] },
  { label: "3:4", ratio: [3, 4] },
  { label: "4:5", ratio: [4, 5] },
  { label: "2:3", ratio: [2, 3] },
  { label: "9:16", ratio: [9, 16] },
  { label: "4:3", ratio: [4, 3] },
  { label: "5:4", ratio: [5, 4] },
  { label: "3:2", ratio: [3, 2] },
  { label: "16:9", ratio: [16, 9] },
  { label: "21:9", ratio: [21, 9] },
] as const satisfies ReadonlyArray<{ label: string; ratio: readonly [number, number] | null }>;

// Size tiers pick the target pixel area an aspect ratio is fitted to. 4K is above the
// largest non-experimental area (2560x1440), so it's labelled experimental.
export const SIZE_TIERS = [
  { id: "1K", label: "1K", area: 1536 * 1024 },
  { id: "2K", label: "2K", area: 2560 * 1440 },
  { id: "4K", label: "4K (experimental)", area: 3840 * 2160 },
] as const;

export type SizeTier = (typeof SIZE_TIERS)[number]["id"];

// Documented custom-size limits (see src/docs/gpt-image-2.5-pricing-reference.md).
const MAX_EDGE = 3840;
const MIN_AREA = 655_360;
const MAX_AREA = 8_294_400;
const MAX_ASPECT = 3;

/**
 * Computes a WIDTHxHEIGHT string for an aspect ratio at a tier's target area. Edges are
 * floored (not rounded) to multiples of 16 so the area never exceeds the tier target, and a
 * long edge over 3840 is clamped with the other derived from the ratio.
 */
export function sizeFromAspectRatio(w: number, h: number, tier: SizeTier = "1K"): string {
  const area = SIZE_TIERS.find((t) => t.id === tier)!.area;
  let width = Math.sqrt((area * w) / h);
  let height = (width * h) / w;
  const long = Math.max(width, height);
  if (long > MAX_EDGE) {
    const scale = MAX_EDGE / long;
    width *= scale;
    height *= scale;
  }
  // The epsilon absorbs float error so an exact multiple (e.g. a clamped 3840) isn't floored down.
  const snap = (v: number) => Math.floor(v / 16 + 1e-9) * 16;
  return `${snap(width)}x${snap(height)}`;
}

/** Returns an error message if `size` breaks the API's constraints, else null. "auto" is valid. */
export function validateSize(size: unknown): string | null {
  if (size === "auto") return null;
  const m = typeof size === "string" ? /^(\d+)x(\d+)$/.exec(size) : null;
  if (!m) return "Size must be \"auto\" or WIDTHxHEIGHT";
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (width % 16 !== 0 || height % 16 !== 0) return "Both size edges must be multiples of 16";
  if (width > MAX_EDGE || height > MAX_EDGE) return `Size edges can't exceed ${MAX_EDGE}px`;
  if (Math.max(width, height) / Math.min(width, height) > MAX_ASPECT) return "Aspect ratio can't exceed 3:1";
  const area = width * height;
  if (area < MIN_AREA || area > MAX_AREA) return "Total pixels must be between 655,360 and 8,294,400";
  return null;
}

/** JPEG has no alpha channel, so a transparent background can't be honoured with it. */
export function validateFormatBackground(format: string, background: string): string | null {
  return format === "jpeg" && background === "transparent"
    ? "Transparent background requires PNG or WebP (JPEG has no alpha channel)"
    : null;
}

/** Compression (0-100) applies to JPEG/WebP only; null means "leave it to the API default". */
export function normalizeCompression(format: string, raw: unknown): number | null {
  if (format === "png" || raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 0), 100) : null;
}

export const N_OPTIONS = [1, 2, 4] as const;
