import sharp from "sharp";

const FEATHER_SIGMA = 2;

/**
 * Pastes the model's edited pixels back onto the original, but only where the mask says "edit".
 * OpenAI's mask convention (and what mask-editor.tsx produces) is: transparent = editable,
 * opaque = protected. Everything the mask protects therefore stays exactly as it was in the
 * original, instead of drifting through the model's re-render.
 *
 * The seam is feathered inward only (weight = min(mask, blurred mask)), so the protected area
 * is never touched, not even by the blur. Pixel-exact output is guaranteed for PNG; JPEG/WebP
 * are re-encoded and can only be identical up to their own compression.
 */
export async function compositeMaskedEdit(params: {
  original: Buffer;
  mask: Buffer;
  result: Buffer;
  format: string;
  /** JPEG/WebP quality (0-100); defaults to 100, matching the API's own default. */
  compression?: number | null;
}): Promise<{ buffer: Buffer; width: number; height: number }> {
  // rotate() applies EXIF orientation, matching what the browser drew the mask against.
  const original = await sharp(params.original).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = original.info;

  const toRgba = (input: Buffer) =>
    sharp(input).ensureAlpha().resize(width, height, { fit: "fill" }).raw().toBuffer();
  const [maskRgba, resultRgba] = await Promise.all([toRgba(params.mask), toRgba(params.result)]);

  // Editable amount per pixel: transparent (alpha 0) -> 255, opaque -> 0.
  const edit = Buffer.alloc(width * height);
  for (let i = 0; i < edit.length; i++) edit[i] = 255 - maskRgba[i * 4 + 3];
  const blurred = await sharp(edit, { raw: { width, height, channels: 1 } })
    .blur(FEATHER_SIGMA)
    // sharp expands single-channel output to 3-channel sRGB; take one channel back out.
    .extractChannel(0)
    .raw()
    .toBuffer();

  const out = Buffer.from(original.data);
  for (let i = 0; i < edit.length; i++) {
    const w = Math.min(edit[i], blurred[i]);
    if (w === 0) continue; // protected: keep the original bytes as-is
    const o = i * 4;
    for (let c = 0; c < 4; c++) {
      out[o + c] = w === 255 ? resultRgba[o + c] : Math.round((original.data[o + c] * (255 - w) + resultRgba[o + c] * w) / 255);
    }
  }

  const image = sharp(out, { raw: { width, height, channels: 4 } });
  const quality = params.compression ?? 100;
  const encoded =
    params.format === "jpeg"
      ? await image.flatten({ background: "#ffffff" }).jpeg({ quality }).toBuffer()
      : params.format === "webp"
        ? await image.webp({ quality }).toBuffer()
        : await image.png().toBuffer();
  return { buffer: encoded, width, height };
}
