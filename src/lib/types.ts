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
  sourceType: "generate" | "edit";
  referenceImageIds: string[];
  costEstimate: string | null;
  createdAt: string;
};

export type PartialImageEvent = {
  type: "partial";
  index: number;
  b64: string;
};

export type DoneImageEvent = {
  type: "done";
  image: ImageRecord;
};

export type ErrorEvent = {
  type: "error";
  message: string;
};

export type GenerationStreamEvent = PartialImageEvent | DoneImageEvent | ErrorEvent;
