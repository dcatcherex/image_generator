#!/usr/bin/env node
// Splits a transparent sticker sheet (e.g. from the "LINE sticker sheet" preset) into
// LINE Creators Market files: each sticker trimmed, fitted inside 370x320 with a 10px
// margin, and saved as 01.png, 02.png, ... plus main.png (240x240) and tab.png (96x74).
//
// Usage:
//   node scripts/split-stickers.mjs <sheet.png> [out-dir] [options]
//
// Options:
//   --grid 4x2     Cut by a fixed columns x rows grid instead of auto-detecting stickers.
//   --start 9      Number of the first output file (for the second sheet of a set, etc.).
//   --expect 8     Warn if a different number of stickers is found (default 8).
//   --main 1       Which sticker (1-based, within this sheet) becomes main.png/tab.png;
//                  0 skips them (default 1, only written when --start is 1).
//   --alpha 16     Alpha (0-255) above which a pixel counts as part of a sticker.

import { mkdir } from "node:fs/promises";
import { statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const STICKER = { width: 370, height: 320 };
const MAIN = { width: 240, height: 240 };
const TAB = { width: 96, height: 74 };
const MARGIN = 10;
const MAX_BYTES = 1024 * 1024;

function parseArgs(argv) {
  const opts = { grid: null, start: 1, expect: 8, main: 1, alpha: 16 };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      positional.push(a);
      continue;
    }
    const value = argv[++i];
    if (value === undefined) fail(`Missing value for ${a}`);
    switch (a) {
      case "--grid": {
        const m = /^(\d+)x(\d+)$/i.exec(value);
        if (!m) fail("--grid must look like 4x2 (columns x rows)");
        opts.grid = { cols: Number(m[1]), rows: Number(m[2]) };
        break;
      }
      case "--start": opts.start = toInt(a, value, 1); break;
      case "--expect": opts.expect = toInt(a, value, 1); break;
      case "--main": opts.main = toInt(a, value, 0); break;
      case "--alpha": opts.alpha = toInt(a, value, 0); break;
      default: fail(`Unknown option ${a}`);
    }
  }
  if (!positional[0]) {
    fail("Usage: node scripts/split-stickers.mjs <sheet.png> [out-dir] [--grid 4x2] [--start 1] [--expect 8] [--main 1]");
  }
  const input = positional[0];
  const outDir = positional[1] ?? path.join(path.dirname(input), `${path.parse(input).name}-stickers`);
  return { input, outDir, opts };
}

function toInt(name, value, min) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) fail(`${name} must be an integer >= ${min}`);
  return n;
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

/** Bounding box of opaque pixels inside a region, or null if the region is empty. */
function opaqueBounds(mask, width, region) {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = region.top; y < region.top + region.height; y++) {
    for (let x = region.left; x < region.left + region.width; x++) {
      if (!mask[y * width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

/** Bounding boxes of 4-connected opaque regions, found with an iterative flood fill. */
function components(mask, width, height) {
  const seen = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const boxes = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let head = 0, tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    const box = { minX: Infinity, minY: Infinity, maxX: -1, maxY: -1, pixels: 0 };
    while (head < tail) {
      const p = queue[head++];
      const x = p % width;
      const y = (p - x) / width;
      box.pixels++;
      if (x < box.minX) box.minX = x;
      if (x > box.maxX) box.maxX = x;
      if (y < box.minY) box.minY = y;
      if (y > box.maxY) box.maxY = y;
      const neighbours = [
        x > 0 ? p - 1 : -1,
        x < width - 1 ? p + 1 : -1,
        y > 0 ? p - width : -1,
        y < height - 1 ? p + width : -1,
      ];
      for (const q of neighbours) {
        if (q >= 0 && mask[q] && !seen[q]) {
          seen[q] = 1;
          queue[tail++] = q;
        }
      }
    }
    boxes.push(box);
  }
  return boxes;
}

/**
 * Merges boxes closer than `gap` px so a sticker's loose parts (a floating doodle, a caption
 * outside the outline) stay with it. Repeats until nothing changes.
 */
function mergeNearby(boxes, gap) {
  let merged = boxes.map((b) => ({ ...b }));
  let changed = true;
  while (changed) {
    changed = false;
    const next = [];
    for (const b of merged) {
      const hit = next.find(
        (o) =>
          b.minX - gap <= o.maxX && o.minX - gap <= b.maxX &&
          b.minY - gap <= o.maxY && o.minY - gap <= b.maxY
      );
      if (hit) {
        hit.minX = Math.min(hit.minX, b.minX);
        hit.minY = Math.min(hit.minY, b.minY);
        hit.maxX = Math.max(hit.maxX, b.maxX);
        hit.maxY = Math.max(hit.maxY, b.maxY);
        hit.pixels += b.pixels;
        changed = true;
      } else {
        next.push(b);
      }
    }
    merged = next;
  }
  return merged;
}

/** Reading order: group boxes into rows by vertical overlap, then sort each row left to right. */
function readingOrder(boxes) {
  const byTop = [...boxes].sort((a, b) => a.minY - b.minY);
  const rows = [];
  for (const b of byTop) {
    const centerY = (b.minY + b.maxY) / 2;
    const row = rows.find((r) => centerY >= r.minY && centerY <= r.maxY);
    if (row) {
      row.items.push(b);
      row.minY = Math.min(row.minY, b.minY);
      row.maxY = Math.max(row.maxY, b.maxY);
    } else {
      rows.push({ minY: b.minY, maxY: b.maxY, items: [b] });
    }
  }
  return rows.flatMap((r) => r.items.sort((a, b) => a.minX - b.minX));
}

function detectBoxes(mask, width, height, opts) {
  if (opts.grid) {
    const { cols, rows } = opts.grid;
    const boxes = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const left = Math.round((c * width) / cols);
        const top = Math.round((r * height) / rows);
        const region = {
          left,
          top,
          width: Math.round(((c + 1) * width) / cols) - left,
          height: Math.round(((r + 1) * height) / rows) - top,
        };
        const b = opaqueBounds(mask, width, region);
        if (b) boxes.push(b);
        else console.warn(`Grid cell row ${r + 1}, column ${c + 1} is empty; skipped.`);
      }
    }
    return boxes;
  }
  const minPixels = Math.max(64, Math.round(width * height * 0.0005));
  const gap = Math.round(Math.min(width, height) * 0.015);
  const parts = mergeNearby(components(mask, width, height), gap);
  const stickers = parts.filter((b) => b.pixels >= minPixels);
  // Small leftovers (a sparkle or sweat drop drawn a bit away from the sticker) join the
  // nearest sticker if they're reasonably close; anything farther is stray noise.
  const reach = Math.round(Math.min(width, height) * 0.06);
  let dropped = 0;
  for (const piece of parts.filter((b) => b.pixels < minPixels)) {
    let best = null, bestDist = Infinity;
    for (const s of stickers) {
      const dx = Math.max(0, s.minX - piece.maxX, piece.minX - s.maxX);
      const dy = Math.max(0, s.minY - piece.maxY, piece.minY - s.maxY);
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) [best, bestDist] = [s, dist];
    }
    if (best && bestDist <= reach) {
      best.minX = Math.min(best.minX, piece.minX);
      best.minY = Math.min(best.minY, piece.minY);
      best.maxX = Math.max(best.maxX, piece.maxX);
      best.maxY = Math.max(best.maxY, piece.maxY);
    } else {
      dropped++;
    }
  }
  if (dropped) console.warn(`Ignored ${dropped} stray speck(s) far from any sticker.`);
  return readingOrder(stickers);
}

/** Trims to the box and fits it, centered with a margin, on a transparent canvas. */
async function fitted(input, box, size, margin) {
  const crop = await sharp(input)
    .extract({
      left: box.minX,
      top: box.minY,
      width: box.maxX - box.minX + 1,
      height: box.maxY - box.minY + 1,
    })
    .resize({
      width: size.width - margin * 2,
      height: size.height - margin * 2,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: "lanczos3",
    })
    .png()
    .toBuffer();
  return sharp(crop)
    .extend({ top: margin, bottom: margin, left: margin, right: margin, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function save(buffer, file) {
  await sharp(buffer).toFile(file);
  const bytes = statSync(file).size;
  if (bytes > MAX_BYTES) console.warn(`  ${path.basename(file)} is ${(bytes / 1024).toFixed(0)} KB — LINE's limit is 1 MB.`);
}

async function main() {
  const { input, outDir, opts } = parseArgs(process.argv.slice(2));
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  const mask = new Uint8Array(width * height);
  let opaque = 0;
  for (let i = 0; i < mask.length; i++) {
    if (data[i * 4 + 3] > opts.alpha) {
      mask[i] = 1;
      opaque++;
    }
  }
  if (opaque > mask.length * 0.95) {
    fail(
      "The sheet has no transparent background (almost every pixel is opaque).\n" +
      "Regenerate with Background = transparent and Format = PNG, or remove the background first."
    );
  }

  const boxes = detectBoxes(mask, width, height, opts);
  if (boxes.length === 0) fail("No stickers found.");
  if (boxes.length !== opts.expect) {
    console.warn(
      `Found ${boxes.length} stickers, expected ${opts.expect}. ` +
      `If stickers were merged or split, try --grid ${opts.grid ? `${opts.grid.cols}x${opts.grid.rows}` : "4x2"}.`
    );
  }

  await mkdir(outDir, { recursive: true });
  console.log(`${path.basename(input)} (${width}x${height}) -> ${outDir}`);

  for (const [i, box] of boxes.entries()) {
    const name = `${String(opts.start + i).padStart(2, "0")}.png`;
    await save(await fitted(input, box, STICKER, MARGIN), path.join(outDir, name));
    console.log(`  ${name}  from ${box.maxX - box.minX + 1}x${box.maxY - box.minY + 1} at (${box.minX}, ${box.minY})`);
  }

  // main/tab belong to the whole set, so only the first sheet writes them by default.
  if (opts.main > 0 && opts.start === 1) {
    const box = boxes[opts.main - 1];
    if (!box) {
      console.warn(`--main ${opts.main} is out of range; main.png and tab.png skipped.`);
    } else {
      await save(await fitted(input, box, MAIN, 8), path.join(outDir, "main.png"));
      await save(await fitted(input, box, TAB, 2), path.join(outDir, "tab.png"));
      console.log(`  main.png, tab.png  from sticker ${opts.main}`);
    }
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
