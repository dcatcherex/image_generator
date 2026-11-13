// Prompts mark the parts to fill in as `<placeholder>` (the presets) or `[placeholder]` (common
// in prompts pasted from elsewhere). These helpers find them so the prompt box can highlight
// them, jump between them with Tab and warn before one is sent unfilled.

export type Range = { start: number; end: number };

// No whitespace just inside the brackets, so "a < b > c" or "[ x ]" isn't one; it must contain a
// letter, so "[16:9]" isn't either; and a square pair followed by "(" is a Markdown link.
const PLACEHOLDER = /<(?!\s)(?=[^<>\n]*\p{L})[^<>\n]+?(?<!\s)>|\[(?!\s)(?=[^[\]\n]*\p{L})[^[\]\n]+?(?<!\s)\](?!\()/gu;

export function findPlaceholders(text: string): Range[] {
  return Array.from(text.matchAll(PLACEHOLDER), (m) => ({ start: m.index, end: m.index + m[0].length }));
}

/**
 * The placeholder after the selection (or before it, when `backward`), wrapping around the
 * ends. Null when the text has none.
 */
export function adjacentPlaceholder(
  text: string,
  selStart: number,
  selEnd: number,
  backward: boolean
): Range | null {
  const all = findPlaceholders(text);
  if (all.length === 0) return null;
  if (backward) {
    return [...all].reverse().find((r) => r.end <= selStart && r.start < selStart) ?? all[all.length - 1];
  }
  return all.find((r) => r.start >= selEnd && r.end > selEnd) ?? all[0];
}
