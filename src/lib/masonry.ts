// True (JS-computed) masonry: unlike CSS `column-count`, which distributes items by
// source order and only estimates a "balanced" height, this always adds the next item to
// whichever column is currently shortest — so columns stay even and there's no leftover
// dead space partway down a column.

const SIZE_PATTERN = /^(\d+)x(\d+)$/;

/** height/width ratio for a stored "WIDTHxHEIGHT" size string; square (1) for "auto" or unknown. */
export function estimateAspectRatio(size: string): number {
  const match = SIZE_PATTERN.exec(size);
  if (!match) return 1;
  const [, width, height] = match;
  return Number(height) / Number(width);
}

/** Greedily assigns each item to the column with the smallest accumulated height so far. */
export function distributeIntoColumns<T>(
  items: T[],
  columnCount: number,
  heightOf: (item: T) => number
): T[][] {
  const columns: T[][] = Array.from({ length: columnCount }, () => []);
  const heights = new Array(columnCount).fill(0);

  for (const item of items) {
    let shortest = 0;
    for (let i = 1; i < columnCount; i++) {
      if (heights[i] < heights[shortest]) shortest = i;
    }
    columns[shortest].push(item);
    heights[shortest] += heightOf(item);
  }

  return columns;
}
