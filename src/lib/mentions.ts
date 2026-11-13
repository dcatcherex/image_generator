// `@image1`, `@image2`… in a prompt mention the reference images by their position (the
// number on each thumbnail). The prompt box highlights them and offers them after typing "@";
// buildPrompt() turns them into "image 1" before the prompt goes to the model.

import type { Range } from "./placeholders";

const MENTION = /(?<![\p{L}\p{N}_])@image(\d{1,2})(?![\p{L}\p{N}_])/giu;

export type Mention = Range & { index: number };

export function findMentions(text: string): Mention[] {
  return Array.from(text.matchAll(MENTION), (m) => ({
    start: m.index,
    end: m.index + m[0].length,
    index: Number(m[1]),
  }));
}

export function mentionToken(index: number): string {
  return `@image${index}`;
}

/** "@image2" -> "image 2", the wording the GPT Image prompting guide uses for inputs. */
export function resolveMentions(text: string): string {
  return text.replace(MENTION, (_m, n: string) => `image ${Number(n)}`);
}

/**
 * The "@query" being typed right before the caret, if any: "@" at the start or after
 * whitespace/punctuation, followed by letters/digits only.
 */
export function activeMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const m = /(^|[\s([{"'“])@([\p{L}\p{N}]*)$/u.exec(text.slice(0, caret));
  if (!m) return null;
  return { start: caret - m[2].length - 1, query: m[2] };
}
