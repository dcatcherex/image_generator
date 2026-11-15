// Blob URLs are cross-origin, so browsers ignore the `download` attribute on links to them.
// Vercel Blob serves `Content-Disposition: attachment` when `?download=1` is set instead.
export function downloadUrl(blobUrl: string): string {
  const url = new URL(blobUrl);
  url.searchParams.set("download", "1");
  return url.toString();
}
