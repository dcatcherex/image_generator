// Approximate per-image cost estimates in USD, shown to the user before they generate.
// OpenAI does not publish these in the API docs, so these are rough placeholders based on
// typical gpt-image pricing tiers. Update this table from your OpenAI dashboard billing
// page if you notice actual charges drifting from the estimate shown in the UI.
export const QUALITY_COST_ESTIMATE: Record<string, number> = {
  low: 0.011,
  medium: 0.042,
  high: 0.167,
  xhigh: 0.25,
  max: 0.35,
  auto: 0.042,
};

const SIZE_MULTIPLIER: Record<string, number> = {
  "1024x1024": 1,
  "1536x1024": 1.5,
  "1024x1536": 1.5,
};

export function estimateCost(quality: string, size: string): number {
  const base = QUALITY_COST_ESTIMATE[quality] ?? QUALITY_COST_ESTIMATE.medium;
  const multiplier = SIZE_MULTIPLIER[size] ?? 1.5;
  return Math.round(base * multiplier * 10000) / 10000;
}
