// LINE rich menu templates: the layouts LINE's Rich Menu Maker offers, each defined once as
// fractional cells so the same data drives the prompt scaffold, the tap-area overlay, the
// `areas[]` JSON and the exact-size JPEG export. Specs (Messaging API docs): JPEG or PNG,
// at most 1 MB, width 800-2500, height >= 250, width/height >= 1.45, up to 20 areas.

export type RichMenuKind = "large" | "compact";

/** Final upload size per kind (the API's largest standard sizes). */
export const RICH_MENU_SIZE: Record<RichMenuKind, { width: number; height: number }> = {
  large: { width: 2500, height: 1686 },
  compact: { width: 2500, height: 843 },
};

/** Generation size per kind: the nearest multiples of 16 the image API accepts (1.486 and 3:1),
 * resized to RICH_MENU_SIZE on export. */
export const RICH_MENU_GEN_SIZE: Record<RichMenuKind, string> = {
  large: "2496x1680",
  compact: "2496x832",
};

export const RICH_MENU_MAX_BYTES = 1_000_000;

/** A cell as fractions of the canvas: x, y, width, height in 0..1. */
type Cell = readonly [number, number, number, number];

export type RichMenuTemplate = {
  id: string;
  kind: RichMenuKind;
  label: string;
  /** One sentence describing the grid for the model. */
  layout: string;
  cells: readonly Cell[];
};

const T = 1 / 3;

export const RICH_MENU_TEMPLATES: readonly RichMenuTemplate[] = [
  {
    id: "large-6",
    kind: "large",
    label: "Large 6 (3×2)",
    layout: "3 equal columns × 2 equal rows (6 buttons), dividers at exactly 1/3 and 2/3 of the width and 1/2 of the height",
    cells: [
      [0, 0, T, 0.5], [T, 0, T, 0.5], [2 * T, 0, T, 0.5],
      [0, 0.5, T, 0.5], [T, 0.5, T, 0.5], [2 * T, 0.5, T, 0.5],
    ],
  },
  {
    id: "large-4",
    kind: "large",
    label: "Large 4 (2×2)",
    layout: "2 equal columns × 2 equal rows (4 buttons), dividers at exactly 1/2 of the width and 1/2 of the height",
    cells: [
      [0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5],
      [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5],
    ],
  },
  {
    id: "large-hero-3",
    kind: "large",
    label: "Large hero + 3",
    layout: "one full-width banner across the top half, and 3 equal buttons across the bottom half with dividers at exactly 1/3 and 2/3 of the width",
    cells: [
      [0, 0, 1, 0.5],
      [0, 0.5, T, 0.5], [T, 0.5, T, 0.5], [2 * T, 0.5, T, 0.5],
    ],
  },
  {
    id: "large-left-2",
    kind: "large",
    label: "Large left + 2",
    layout: "one tall button filling the left half, and 2 stacked buttons in the right half split at exactly 1/2 of the height",
    cells: [
      [0, 0, 0.5, 1],
      [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5],
    ],
  },
  {
    id: "large-2",
    kind: "large",
    label: "Large 2 rows",
    layout: "2 full-width buttons stacked, split at exactly 1/2 of the height",
    cells: [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]],
  },
  {
    id: "large-1",
    kind: "large",
    label: "Large single",
    layout: "one button filling the whole canvas",
    cells: [[0, 0, 1, 1]],
  },
  {
    id: "compact-3",
    kind: "compact",
    label: "Compact 3",
    layout: "3 equal columns in one row (3 buttons), dividers at exactly 1/3 and 2/3 of the width",
    cells: [[0, 0, T, 1], [T, 0, T, 1], [2 * T, 0, T, 1]],
  },
  {
    id: "compact-2",
    kind: "compact",
    label: "Compact 2",
    layout: "2 equal columns in one row (2 buttons), divider at exactly 1/2 of the width",
    cells: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]],
  },
  {
    id: "compact-hero-1",
    kind: "compact",
    label: "Compact wide + 1",
    layout: "a wide banner button filling the left 2/3, and one button in the right 1/3, divider at exactly 2/3 of the width",
    cells: [[0, 0, 2 * T, 1], [2 * T, 0, T, 1]],
  },
  {
    id: "compact-1",
    kind: "compact",
    label: "Compact single",
    layout: "one button filling the whole canvas",
    cells: [[0, 0, 1, 1]],
  },
];

export function getRichMenuTemplate(id: string): RichMenuTemplate | undefined {
  return RICH_MENU_TEMPLATES.find((t) => t.id === id);
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Plain-words position of a cell, e.g. "top-left" or "left 2/3". */
function cellPosition(cell: Cell, cells: readonly Cell[]): string {
  const [x, y, w, h] = cell;
  if (cells.length === 1) return "whole canvas";
  const col = w === 1 ? "" : x === 0 ? "left" : x + w >= 0.999 ? "right" : "middle";
  const row = h === 1 ? "" : y === 0 ? "top" : "bottom";
  const name = [row, col].filter(Boolean).join("-");
  return `${name} (x ${pct(x)}–${pct(x + w)}, y ${pct(y)}–${pct(y + h)})`;
}

/** Prompt marker the export dialog uses to recognise which template an image was made with.
 * Parentheses, not brackets, so the prompt box doesn't treat it as a placeholder. */
export function richMenuMarker(t: RichMenuTemplate): string {
  return `LINE rich menu (${t.id})`;
}

/** The labelled-section scaffold for a template (`{lang}` is filled by presetScaffold). */
export function richMenuScaffold(t: RichMenuTemplate): string {
  const buttons = t.cells
    .map((cell, i) => {
      const big = cell[2] * cell[3] >= 0.5 && t.cells.length > 1;
      const visual = big ? "visual: <hero photo or illustration, e.g. this month's promotion>" : "icon: <simple icon, e.g. calendar>";
      return `${i + 1}. ${cellPosition(cell, t.cells)} — ${visual} — label: "<short label{lang}>"`;
    })
    .join("\n");
  return `Type: ${richMenuMarker(t)} — the flat tappable button panel a LINE Official Account shows under the chat, filling the entire canvas edge to edge
Layout: ${t.layout}. Each button is its own clearly separated tile (a thin gap or contrasting outline exactly on the boundaries) so it reads as tappable.
Style: <icon style and background mood, e.g. rounded flat icons on soft pastel tiles>
Buttons (left to right, top to bottom):
${buttons}
Each button: content centered in its tile, one bold short label large enough to read on a phone, high contrast
Constraints: each label exactly once and spelled exactly as written, no other text, nothing important within 4% of the canvas edges or across a tile boundary, no phone frame, no chat bubbles, no logos unless asked, no watermarks`;
}

/** The template named by a prompt's marker, if any. */
export function detectRichMenuTemplate(prompt: string): RichMenuTemplate | undefined {
  // Also accepts the older "[id]" form.
  const m = /LINE rich menu [([]([a-z0-9-]+)[)\]]/.exec(prompt);
  return m ? getRichMenuTemplate(m[1]) : undefined;
}

/** Best-guess template for an image: its prompt marker, else by aspect ratio. */
export function guessRichMenuTemplate(prompt: string, width?: number, height?: number): RichMenuTemplate {
  const marked = detectRichMenuTemplate(prompt);
  if (marked) return marked;
  const compact = width && height ? width / height > 2.2 : false;
  return getRichMenuTemplate(compact ? "compact-3" : "large-6")!;
}

/** True when a prompt or size looks like a rich menu, to decide whether to offer the export. */
export function looksLikeRichMenu(prompt: string, size: string): boolean {
  if (detectRichMenuTemplate(prompt)) return true;
  const m = /^(\d+)x(\d+)$/.exec(size);
  if (!m) return false;
  const r = Number(m[1]) / Number(m[2]);
  return Math.abs(r - 2500 / 1686) < 0.01 || Math.abs(r - 2500 / 843) < 0.02;
}

export type Bounds = { x: number; y: number; width: number; height: number };

/** Pixel bounds per cell at the template's upload size; edges are rounded once so
 * neighbouring areas share boundaries exactly (no gaps or overlaps). */
export function richMenuBounds(t: RichMenuTemplate): Bounds[] {
  const { width: W, height: H } = RICH_MENU_SIZE[t.kind];
  return t.cells.map(([x, y, w, h]) => {
    const x0 = Math.round(x * W);
    const y0 = Math.round(y * H);
    return { x: x0, y: y0, width: Math.round((x + w) * W) - x0, height: Math.round((y + h) * H) - y0 };
  });
}

/** Button labels in the order they appear in a prompt's `label: "..."` lines. */
export function extractLabels(prompt: string): string[] {
  return [...prompt.matchAll(/label: "([^"<>]+)"/g)].map((m) => m[1].trim());
}

/** A rich menu object ready for POST /v2/bot/richmenu, with message actions as placeholders. */
export function richMenuJson(t: RichMenuTemplate, labels: string[] = []) {
  return {
    size: RICH_MENU_SIZE[t.kind],
    selected: false,
    name: t.label,
    chatBarText: "Menu",
    areas: richMenuBounds(t).map((bounds, i) => ({
      bounds,
      // Placeholder: change to { type: "uri", uri } or { type: "postback", data } as needed.
      action: { type: "message", text: labels[i] ?? `Button ${i + 1}` },
    })),
  };
}

/**
 * Renders the image at the template's exact upload size (cover-fit, centered) on white, as a
 * JPEG stepped down in quality until it fits LINE's 1 MB limit. Browser only.
 */
export async function exportRichMenuJpeg(src: string, kind: RichMenuKind): Promise<Blob> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Couldn't load the image (${res.status})`);
  const bitmap = await createImageBitmap(await res.blob());
  const { width: W, height: H } = RICH_MENU_SIZE[kind];
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingQuality = "high";
  const scale = Math.max(W / bitmap.width, H / bitmap.height);
  const dw = bitmap.width * scale;
  const dh = bitmap.height * scale;
  ctx.drawImage(bitmap, (W - dw) / 2, (H - dh) / 2, dw, dh);
  bitmap.close();

  for (let q = 0.92; q >= 0.4; q -= 0.06) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", q));
    if (blob && blob.size <= RICH_MENU_MAX_BYTES) return blob;
  }
  throw new Error("Couldn't get the JPEG under 1 MB");
}
