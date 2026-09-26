import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getOpenAI() {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

export const MODELS = {
  generate: "gpt-image-2.5-flare",
  edit: "gpt-image-2.5-sunburst",
} as const;

export type ImageModel = (typeof MODELS)[keyof typeof MODELS];

export const SIZE_OPTIONS = ["1024x1024", "1536x1024", "1024x1536"] as const;
export const QUALITY_OPTIONS = ["low", "medium", "high", "xhigh", "max", "auto"] as const;
