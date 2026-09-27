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

export function estimateCost(quality: string, size: string): number {
  // "auto" has no fixed quality tier — OpenAI picks one at generation time — so we fall
  // back to the medium row as a reasonable midpoint estimate, matching prior behavior.
  const row = COST_TABLE[quality] ?? COST_TABLE.medium;
  const cost = row[size] ?? row["1024x1024"];
  return Math.round(cost * 10000) / 10000;
}

// Approximate, manually-set USD→THB rate (not live-fetched — update this constant
// periodically if it drifts noticeably from the real exchange rate).
const THB_PER_USD = 33;

/** Converts a USD cost estimate (from `estimateCost`) to a formatted Thai Baht string. */
export function formatCostThb(usdCost: number): string {
  const thb = usdCost * THB_PER_USD;
  return `฿${thb.toFixed(2)}`;
}
