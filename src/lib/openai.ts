import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getOpenAI() {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

export const MODEL_OPTIONS = ["gpt-image-2.5-sunburst", "gpt-image-2.5-flare"] as const;

export type ImageModel = (typeof MODEL_OPTIONS)[number];

export const QUALITY_OPTIONS = ["auto", "low", "medium", "high", "xhigh", "max"] as const;

// The GPT image models accept arbitrary WIDTHxHEIGHT sizes (must be divisible by 16, aspect
// ratio between 1:3 and 3:1), so rather than a fixed size list we offer aspect ratios and
// compute a concrete size for each, targeting the same total pixel count as the largest
// documented standard size (1536x1024) to stay well under undocumented resolution limits.
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

const TARGET_PIXEL_AREA = 1536 * 1024;

/** Computes a WIDTHxHEIGHT string for an aspect ratio, rounded to a multiple of 16. */
export function sizeFromAspectRatio(w: number, h: number): string {
  const width = Math.round(Math.sqrt((TARGET_PIXEL_AREA * w) / h) / 16) * 16;
  const height = Math.round(((width * h) / w) / 16) * 16;
  return `${width}x${height}`;
}

export const N_OPTIONS = [1, 2, 4] as const;
