// Per-image cost estimates in USD, shown to the user before they generate.
//
// Sourced from OpenAI's published per-image pricing table for GPT Image 2 (the closest
// documented real numbers we have) at our three supported sizes. GPT Image 2.5 (the model
// this app actually uses, `gpt-image-2.5-flare`/`gpt-image-2.5-sunburst`) is priced purely
// token-based in OpenAI's docs ($8/M image input tokens, $2/M cached image input tokens,
// $30/M image output tokens, $5/M text input tokens, $1.25/M cached text input tokens) with
// no published per-image dollar figures or token-count-per-image numbers for its quality
// tiers, so an exact 2.5 table isn't derivable from public docs. We use the GPT Image 2
// table as the best available real-cost proxy for low/medium/high.
//
// `xhigh` and `max` are new to 2.5 and have no published numbers anywhere (for either
// model) — those two rows are EXTRAPOLATED GUESSES (xhigh ≈ 1.55x high, max ≈ 2.2x high),
// not sourced figures. Re-check against actual OpenAI billing once you have real charges at
// those tiers and adjust.
const COST_TABLE: Record<string, Record<string, number>> = {
  low: {
    "1024x1024": 0.006,
    "1024x1536": 0.005,
    "1536x1024": 0.005,
  },
  medium: {
    "1024x1024": 0.053,
    "1024x1536": 0.041,
    "1536x1024": 0.041,
  },
  high: {
    "1024x1024": 0.211,
    "1024x1536": 0.165,
    "1536x1024": 0.165,
  },
  // Extrapolated (~1.55x high) — no published source, see note above.
  xhigh: {
    "1024x1024": 0.327,
    "1024x1536": 0.256,
    "1536x1024": 0.256,
  },
  // Extrapolated (~2.2x high) — no published source, see note above.
  max: {
    "1024x1024": 0.464,
    "1024x1536": 0.363,
    "1536x1024": 0.363,
  },
};

export function estimateCost(quality: string, size: string, { partials = 0 }: { partials?: number } = {}): number {
  // "auto" has no fixed quality tier — OpenAI picks one at generation time — so we fall
  // back to the medium row as a reasonable midpoint estimate, matching prior behavior.
  const row = COST_TABLE[quality] ?? COST_TABLE.medium;
  const cost = row[size] ?? row["1024x1024"];
  // Streamed preview frames bill 100 output tokens each (see PARTIAL_IMAGE_TOKENS below).
  return Math.round((cost + previewCostUsd(partials)) * 10000) / 10000;
}

// Approximate, manually-set USD→THB rate (not live-fetched — update this constant
// periodically if it drifts noticeably from the real exchange rate).
const THB_PER_USD = 33;

/** Converts a USD cost estimate (from `estimateCost`) to a formatted Thai Baht string. */
export function formatCostThb(usdCost: number): string {
  const thb = usdCost * THB_PER_USD;
  return `฿${thb.toFixed(2)}`;
}

// --- Actual cost from response `usage` ---------------------------------------------------
// Rates and the 50% Batch factor are documented (with billing verification) in
// src/docs/gpt-image-2.5-pricing-reference.md. Cached-input discounts don't apply to the
// direct Images API, so they're ignored.
const IMAGE_INPUT_USD_PER_M = 8;
const TEXT_INPUT_USD_PER_M = 5;
const IMAGE_OUTPUT_USD_PER_M = 30;

/** OpenAI's Batch API discount for GPT Image 2.5 — verified at exactly 50% from billing
 * (see the pricing doc's "Verifying the Batch price" section). */
export const BATCH_PRICE_MULTIPLIER = 0.5;

/** Each streamed partial image bills this many image output tokens. */
export const PARTIAL_IMAGE_TOKENS = 100;

/** Shape shared by the Images API response, the streamed completed event and batch output lines. */
export type ImageUsage = {
  input_tokens?: number;
  input_tokens_details?: { image_tokens?: number; text_tokens?: number };
  output_tokens?: number;
};

export type UsageFields = {
  actualCost: number | null;
  inputTokens: number | null;
  inputImageTokens: number | null;
  outputTokens: number | null;
};

const NO_USAGE: UsageFields = { actualCost: null, inputTokens: null, inputImageTokens: null, outputTokens: null };

export function actualCostFromUsage(usage: ImageUsage, { batch = false }: { batch?: boolean } = {}): number {
  const input = usage.input_tokens ?? 0;
  const imageIn = usage.input_tokens_details?.image_tokens ?? 0;
  const textIn = usage.input_tokens_details?.text_tokens ?? Math.max(input - imageIn, 0);
  const usd =
    (textIn * TEXT_INPUT_USD_PER_M +
      imageIn * IMAGE_INPUT_USD_PER_M +
      (usage.output_tokens ?? 0) * IMAGE_OUTPUT_USD_PER_M) /
    1_000_000;
  return usd * (batch ? BATCH_PRICE_MULTIPLIER : 1);
}

/**
 * Turns a response `usage` into the columns stored on an image row. `usage` is optional
 * everywhere (never assume the API returned it); pass `count` > 1 to split a multi-image
 * response's tokens and cost evenly across its images.
 */
export function usageToFields(
  usage: ImageUsage | null | undefined,
  { batch = false, count = 1 }: { batch?: boolean; count?: number } = {}
): UsageFields {
  if (!usage || typeof usage.output_tokens !== "number") return NO_USAGE;
  const split = (v: number | undefined) => (typeof v === "number" ? Math.round(v / count) : null);
  return {
    actualCost: actualCostFromUsage(usage, { batch }) / count,
    inputTokens: split(usage.input_tokens),
    inputImageTokens: split(usage.input_tokens_details?.image_tokens),
    outputTokens: split(usage.output_tokens),
  };
}

/** The size an image actually came back at, when the response reports a WxH string. */
export function actualSizeOr(requested: string, reported: unknown): string {
  return typeof reported === "string" && /^\d+x\d+$/.test(reported) ? reported : requested;
}

/** Cost line for an image: the recorded actual cost, else the stored estimate (prefixed "~"). */
export function imageCostLabel(image: { actualCost: string | null; costEstimate: string | null }): string | null {
  if (image.actualCost != null) return formatCostThb(Number(image.actualCost));
  if (image.costEstimate != null) return `~${formatCostThb(Number(image.costEstimate))}`;
  return null;
}

export function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** USD billed for streaming `partials` preview frames. */
export function previewCostUsd(partials: number): number {
  return (partials * PARTIAL_IMAGE_TOKENS * IMAGE_OUTPUT_USD_PER_M) / 1_000_000;
}
