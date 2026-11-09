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

// Long edge an SVG is rasterized to when it becomes a reference image.
const SVG_RASTER_EDGE = 2048;

/**
 * Renders an SVG to a PNG, since the edit endpoint only accepts raster inputs. Sized to
 * SVG_RASTER_EDGE on the long edge, keeping the SVG's own aspect ratio (its width/height, or
 * its viewBox when it has no intrinsic size).
 */
async function rasterizeSvg(blob: Blob): Promise<Blob> {
  const text = await blob.text();
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    let ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0;
    if (!ratio) {
      const box = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
      ratio = box && Number(box[2]) > 0 ? Number(box[1]) / Number(box[2]) : 1;
    }
    const width = Math.round(ratio >= 1 ? SVG_RASTER_EDGE : SVG_RASTER_EDGE * ratio);
    const height = Math.round(ratio >= 1 ? SVG_RASTER_EDGE / ratio : SVG_RASTER_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't rasterize the SVG"))), "image/png")
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function referenceItemFromImage(image: ImageRecord): Promise<ReferenceItem> {
  const res = await fetch(image.blobUrl);
  let blob = await res.blob();
  let ext = image.format;
  // Edits don't take SVG input, so a vector result goes in as a PNG rendering of itself.
  if (image.format === "svg") {
    blob = await rasterizeSvg(blob);
    ext = "png";
  }
  const file = new File([blob], `${image.id}.${ext}`, {
    type: blob.type || `image/${ext}`,
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
