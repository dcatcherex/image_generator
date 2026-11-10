import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getOpenAI() {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

export const MODEL = [
  "gpt-image-2.5-sunburst",
  "gpt-image-2.5-flare",
  "gpt-image-2.6-sunburst",
  "gpt-image-2.6-flare",
] as const;

/** "gpt-image-2.5-flare" -> "Flare" (for compact labels). */
export function modelShortName(model: string): string {
  const last = model.split("-").pop() ?? model;
  return last.charAt(0).toUpperCase() + last.slice(1);
}

export type ImageModel = (typeof MODEL)[number];

/** Used when a request or the panel doesn't pick a model. */
export const DEFAULT_MODEL: ImageModel = "gpt-image-2.6-sunburst";

/** "gpt-image-2.6-flare" -> "2.6" ("" when the id doesn't carry a version). */
export function modelVersion(model: string): string {
  return /gpt-image-([\d.]+)-/.exec(model)?.[1] ?? "";
}

/**
 * The Sunburst/Flare pair a comparison runs: both models of the selected model's version,
 * Sunburst first so the compare dialog's left/right slots stay stable.
 */
export function compareModels(model: string): [ImageModel, ImageModel] {
  const version = modelVersion(model);
  const pair = MODEL.filter((m) => modelVersion(m) === version);
  return pair.length === 2 ? [pair[0], pair[1]] : [MODEL[0], MODEL[1]];
}

// GPT Image 2.6 `complexity`: how much the model plans before rendering. The API defaults to
// "high"; lower suits focused edits, higher helps dense text and complex layouts. No fee.
export const COMPLEXITY_OPTIONS = ["low", "medium", "high"] as const;
export type Complexity = (typeof COMPLEXITY_OPTIONS)[number];
export const DEFAULT_COMPLEXITY: Complexity = "high";

export function supportsComplexity(model: string): boolean {
  return modelVersion(model) === "2.6";
}

/**
 * SVG output (2.6 only): generations only, n=1, no streaming/partials/compression. The API
 * renders a reference image (`quality` and `complexity` apply to it) and a separate author
 * model writes the SVG from it.
 */
export function supportsSvg(model: string): boolean {
  return modelVersion(model) === "2.6";
}

/**
 * Animated GIF output (2.6 only): generations and edits, no streaming/partials/compression
 * and no mask. `size` is per frame; frames x frame size x n must fit the model's pixel
 * budget, so we keep n=1.
 */
export function supportsGif(model: string): boolean {
  return modelVersion(model) === "2.6";
}

export const GIF_FRAMES = { min: 2, max: 16, default: 9 } as const;
export const GIF_FRAME_MS = { min: 20, max: 2000, default: 200, step: 10 } as const;

export type GifSettings = { frameCount: number; frameDurationMs: number };

/** Clamps GIF settings to the documented ranges (duration rounded to 10 ms, as the API does). */
export function normalizeGif(frameCount: unknown, frameDurationMs: unknown): GifSettings {
  const frames = Number(frameCount);
  const ms = Number(frameDurationMs);
  return {
    frameCount: Number.isFinite(frames)
      ? Math.min(Math.max(Math.round(frames), GIF_FRAMES.min), GIF_FRAMES.max)
      : GIF_FRAMES.default,
    frameDurationMs: Number.isFinite(ms)
      ? Math.min(Math.max(Math.round(ms / 10) * 10, GIF_FRAME_MS.min), GIF_FRAME_MS.max)
      : GIF_FRAME_MS.default,
  };
}

/** The request fields for GIF output. */
export function gifParams(gif: GifSettings) {
  return { frame_count: gif.frameCount, frame_duration_ms: gif.frameDurationMs };
}

/**
 * Rejects an SVG with anything active in it. The API documents static output (no scripts,
 * external resources or embedded rasters), but the file is served publicly and opened
 * directly by the download link, so check rather than trust.
 */
export function unsafeSvgReason(svg: string): string | null {
  if (!/<svg[\s>]/i.test(svg)) return "The returned file isn't an SVG";
  if (/<script[\s>]|<foreignObject[\s>]|\son[a-z]+\s*=|javascript:/i.test(svg)) {
    return "The returned SVG contains active content and was not saved";
  }
  return null;
}

/**
 * The request fields to spread into an images.generate/edit call. Empty for models that
 * don't take `complexity` (or an unknown value), so 2.5 requests are unchanged.
 */
export function complexityParam(model: string, complexity: unknown): { complexity?: Complexity } {
  if (!supportsComplexity(model)) return {};
  if (!COMPLEXITY_OPTIONS.includes(complexity as Complexity)) return {};
  return { complexity: complexity as Complexity };
}

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
