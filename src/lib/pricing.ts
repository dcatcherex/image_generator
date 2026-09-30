// Pre-generation cost estimates. Source of truth for every number here is
// src/docs/gpt-image-2.5-pricing-reference.md: the official GPT Image 2.5 output-token
// table (image output = tokens x $30/M), plus rough prompt-text and preview-frame terms.
// Once real rows exist, /api/cost-stats medians replace these table values (see the panel).
const QUALITIES = ["low", "medium", "high", "xhigh", "max"] as const;

// Output tokens per quality, in QUALITIES order, for every size the official calculator lists.
const OUTPUT_TOKENS: Record<string, readonly number[]> = {
  "1024x1024": [196, 439, 1756, 3122, 7024],
  "1024x1536": [158, 343, 1372, 2459, 5488],
  "1536x1024": [158, 343, 1372, 2459, 5488],
  "1536x864": [120, 280, 1078, 1917, 4312],
  "2048x1152": [157, 367, 1413, 2511, 5650],
  "2560x1440": [205, 478, 1843, 3276, 7370],
  "2048x2048": [397, 892, 3568, 6343, 14272],
  "3840x2160": [371, 865, 3336, 5930, 13342],
  "2160x3840": [371, 865, 3336, 5930, 13342],
};
// Sizes only listed in one orientation are mirrored (same token count).
for (const key of Object.keys(OUTPUT_TOKENS)) {
  const [w, h] = key.split("x");
  OUTPUT_TOKENS[`${h}x${w}`] ??= OUTPUT_TOKENS[key];
}

function parseWxH(size: string): [number, number] | null {
  const m = /^(\d+)x(\d+)$/.exec(size);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

// Sizes not in the table use the documented size with the nearest pixel area *and the same
// orientation*. We deliberately don't scale by megapixels: the official table isn't linear
// (2048x2048 costs more than 3840x2160).
function nearestDocumentedSize(w: number, h: number): string {
  const orientation = Math.sign(w - h);
  const area = w * h;
  let best = "1024x1024";
  let bestDistance = Infinity;
  for (const key of Object.keys(OUTPUT_TOKENS)) {
    const [kw, kh] = parseWxH(key)!;
    if (Math.sign(kw - kh) !== orientation) continue;
    const distance = Math.abs(Math.log((kw * kh) / area));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = key;
    }
  }
  return best;
}

export type CostEstimate = {
  usd: number;
  /** True when the size or quality wasn't an exact table row (auto, or a computed aspect-ratio size). */
  approximate: boolean;
};

export function estimateCost(
  quality: string,
  size: string,
  { partials = 0, promptChars = 0 }: { partials?: number; promptChars?: number } = {}
): CostEstimate {
  // "auto" quality/size have no fixed row — OpenAI picks at generation time — so fall back
  // to medium / 1024x1024 and flag the result as approximate.
  const qualityIndex = QUALITIES.indexOf(quality as (typeof QUALITIES)[number]);
  const dims = parseWxH(size);
  const sizeKey = !dims ? "1024x1024" : OUTPUT_TOKENS[size] ? size : nearestDocumentedSize(dims[0], dims[1]);
  const outputTokens = OUTPUT_TOKENS[sizeKey][qualityIndex === -1 ? 1 : qualityIndex];
  const textTokens = Math.ceil(promptChars / 4);
  const usd =
    (outputTokens * IMAGE_OUTPUT_USD_PER_M + textTokens * TEXT_INPUT_USD_PER_M) / 1_000_000 +
    previewCostUsd(partials);
  return {
    usd: Math.round(usd * 10000) / 10000,
    approximate: qualityIndex === -1 || sizeKey !== size,
  };
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

/** Median actual cost per "model|quality|requested_size" from GET /api/cost-stats. */
export type CostStats = Record<string, { median: number; count: number }>;

/** Minimum recorded rows before a median replaces the table estimate. */
export const CALIBRATION_MIN_COUNT = 3;

export function costStatsKey(model: string, quality: string, requestedSize: string): string {
  return `${model}|${quality}|${requestedSize}`;
}

/** Table estimate, replaced by the recorded median when there are enough real rows. */
export function estimateCostCalibrated(
  stats: CostStats | null,
  model: string,
  quality: string,
  size: string,
  opts: { partials?: number; promptChars?: number } = {}
): CostEstimate {
  const entry = stats?.[costStatsKey(model, quality, size)];
  if (entry && entry.count >= CALIBRATION_MIN_COUNT) return { usd: entry.median, approximate: false };
  return estimateCost(quality, size, opts);
}
