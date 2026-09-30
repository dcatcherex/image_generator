import type { PromptInputs, ReferenceRole } from "./prompt-builder";

export type ImageRecord = {
  id: string;
  prompt: string;
  revisedPrompt: string | null;
  model: string;
  size: string;
  quality: string;
  format: string;
  background: string;
  blobUrl: string;
  blobPathname: string;
  favorite: boolean;
  tag: string | null;
  sourceType: "generate" | "edit";
  referenceImageIds: string[];
  costEstimate: string | null;
  actualCost: string | null;
  requestedSize: string | null;
  previewPartials: number | null;
  inputTokens: number | null;
  inputImageTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
  outputCompression: number | null;
  transparencyOk: boolean | null;
  parentImageId: string | null;
  promptInputs: PromptInputs | null;
  referenceRoles: Array<{ role: ReferenceRole; note?: string }> | null;
  compareGroupId: string | null;
  createdAt: string;
};

export type BatchJobRecord = {
  id: string;
  openaiBatchId: string;
  inputFileId: string;
  outputFileId: string | null;
  errorFileId: string | null;
  status: string;
  requestCount: number;
  completedCount: number;
  failedCount: number;
  requests: Array<{
    customId: string;
    prompt: string;
    size: string;
    quality: string;
    format: string;
    background: string;
    model: string;
    tag: string | null;
    compression?: number | null;
    promptInputs?: PromptInputs | null;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type PartialImageEvent = {
  type: "partial";
  index: number;
  b64: string;
};

export type DoneImageEvent = {
  type: "done";
  image: ImageRecord;
  /** 0-based index of this image within the batch (only meaningful when n > 1). */
  index?: number;
  /** Total number of images requested in this batch (only present when n > 1). */
  total?: number;
  /** Set when the image doesn't fully honour the request (e.g. transparent requested, opaque returned). */
  warning?: string;
};

export type ErrorEvent = {
  type: "error";
  message: string;
};

export type GenerationStreamEvent = PartialImageEvent | DoneImageEvent | ErrorEvent;
