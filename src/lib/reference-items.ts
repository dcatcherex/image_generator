import type { ReferenceRole } from "./prompt-builder";
import type { ImageRecord } from "./types";

export type ReferenceItem = {
  key: string;
  file: File;
  previewUrl: string;
  sourceImageId?: string;
  // Unset means "use the default for this position" (first = subject, rest = other), so
  // removing the first image doesn't leave a stale role behind.
  role?: ReferenceRole;
  note?: string;
};

export async function referenceItemFromImage(image: ImageRecord): Promise<ReferenceItem> {
  const res = await fetch(image.blobUrl);
  const blob = await res.blob();
  const file = new File([blob], `${image.id}.${image.format}`, {
    type: blob.type || `image/${image.format}`,
  });
  return {
    key: `gallery-${image.id}`,
    file,
    previewUrl: image.blobUrl,
    sourceImageId: image.id,
  };
}

export function referenceItemFromFile(file: File): ReferenceItem {
  return {
    key: `upload-${file.name}-${file.size}-${crypto.randomUUID()}`,
    file,
    previewUrl: URL.createObjectURL(file),
  };
}
