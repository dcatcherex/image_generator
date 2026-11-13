"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";
import { findPlaceholders } from "@/lib/placeholders";
import { activeMentionQuery, findMentions, mentionToken } from "@/lib/mentions";

export type MentionImage = { previewUrl: string };

type Mark = { start: number; end: number; kind: "placeholder" | "mention" | "missing" };

const MENU_WIDTH = 208;

/**
 * A Textarea that tints its `<placeholder>` / `[placeholder]` spans and `@image1` mentions. A
 * textarea can't style part of its text, so a mirror layer behind it renders the same text
 * invisibly with the spans marked, kept aligned by sharing padding, font, wrapping and scroll
 * position. With `mentionImages`, typing "@" opens a menu of the reference images.
 */
export function PromptTextarea({
  value,
  className,
  onScroll,
  onKeyDown,
  onSelect,
  onBlur,
  ref,
  mentionImages,
  onValueChange,
  ...props
}: Omit<ComponentProps<typeof Textarea>, "value"> & {
  value: string;
  /** Reference images in upload order; image N is `mentionImages[N - 1]`. */
  mentionImages?: MentionImage[];
  /** Needed for picking a mention from the menu, which edits the value directly. */
  onValueChange?: (value: string) => void;
}) {
  const mirrorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const imageCount = mentionImages?.length ?? 0;
  const mentionsOn = imageCount > 0 && Boolean(onValueChange);

  // The "@query" being typed (start = index of "@"); null when the menu is closed.
  const [menu, setMenu] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  // An "@" the user closed the menu on with Escape; it stays closed until they type elsewhere.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const options = useMemo(() => {
    if (!menu || !mentionsOn) return [];
    const q = menu.query.toLowerCase();
    return Array.from({ length: imageCount }, (_, i) => i + 1).filter((n) => {
      const label = `image${n}`;
      return !q || label.startsWith(q) || String(n).startsWith(q);
    });
  }, [menu, mentionsOn, imageCount]);
  const open = options.length > 0;

  const parts = useMemo(() => {
    const marks: Mark[] = [
      ...findPlaceholders(value).map((r) => ({ ...r, kind: "placeholder" as const })),
      ...findMentions(value).map((r) => ({
        start: r.start,
        end: r.end,
        kind: r.index >= 1 && r.index <= imageCount ? ("mention" as const) : ("missing" as const),
      })),
    ].sort((a, b) => a.start - b.start);

    // The caret marker sits where the "@" starts, so the menu can be placed under it.
    const caretAt = open && menu ? menu.start : -1;
    const out: ReactNode[] = [];
    let at = 0;
    const plain = (from: number, to: number) => {
      if (caretAt >= from && caretAt < to) {
        out.push(value.slice(from, caretAt), <span key="caret" ref={caretRef} />, value.slice(caretAt, to));
      } else if (to > from) {
        out.push(value.slice(from, to));
      }
    };
    for (const m of marks) {
      if (m.start < at) continue; // overlapping spans: keep the first
      plain(at, m.start);
      out.push(
        <mark
          key={m.start}
          className={cn(
            "rounded-sm text-transparent",
            m.kind === "placeholder" && "bg-amber-300/50 dark:bg-amber-400/25",
            m.kind === "mention" && "bg-sky-300/50 dark:bg-sky-400/30",
            m.kind === "missing" && "bg-red-300/60 dark:bg-red-400/30"
          )}
        >
          {value.slice(m.start, m.end)}
        </mark>
      );
      at = m.end;
    }
    plain(at, value.length);
    if (caretAt === value.length) out.push(<span key="caret" ref={caretRef} />);
    return out;
  }, [value, imageCount, open, menu]);

  // Places the menu under the "@" (measured on the mirror's caret marker).
  useLayoutEffect(() => {
    if (!open) return;
    const caret = caretRef.current;
    const mirror = mirrorRef.current;
    const wrapper = wrapperRef.current;
    if (!caret || !mirror || !wrapper) return;
    const lineHeight = parseFloat(getComputedStyle(mirror).lineHeight) || 20;
    const top = caret.offsetTop - mirror.scrollTop + lineHeight + 4;
    const left = Math.max(0, Math.min(caret.offsetLeft, wrapper.clientWidth - MENU_WIDTH));
    setMenuPos({ top, left });
  }, [open, parts]);

  function syncMenu(el: HTMLTextAreaElement) {
    if (!mentionsOn || el.selectionStart !== el.selectionEnd) return setMenu(null);
    const found = activeMentionQuery(el.value, el.selectionStart);
    if (!found || found.start === dismissedAt) {
      setMenu(null);
      if (!found) setDismissedAt(null);
      return;
    }
    if (found.start !== menu?.start || found.query !== menu?.query) setActive(0);
    setMenu(found);
  }

  function pick(n: number) {
    const el = textareaRef.current;
    if (!menu || !el || !onValueChange) return;
    const caret = el.selectionStart;
    const token = mentionToken(n);
    // Add a space after it unless one already follows.
    const after = value.slice(caret);
    const insert = /^\s/.test(after) ? token : `${token} `;
    const next = value.slice(0, menu.start) + insert + after;
    const pos = menu.start + insert.length;
    onValueChange(next);
    setMenu(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (open && menu) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setActive((i) => (i + step + options.length) % options.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(options[Math.min(active, options.length - 1)]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation(); // don't close a surrounding dialog
        setDismissedAt(menu.start);
        setMenu(null);
        return;
      }
    }
    onKeyDown?.(e);
  }

  function setRefs(el: HTMLTextAreaElement | null) {
    textareaRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) (ref as { current: HTMLTextAreaElement | null }).current = el;
  }

  // Both layers reserve the scrollbar's space so their text wraps at the same width.
  const shared = "[scrollbar-gutter:stable] [scrollbar-width:thin] whitespace-pre-wrap break-words";

  return (
    <div ref={wrapperRef} className="relative">
      <div
        ref={mirrorRef}
        aria-hidden
        className={cn(
          shared,
          "pointer-events-none absolute inset-0 overflow-hidden rounded-lg border border-transparent px-2.5 py-2 text-base text-transparent md:text-sm dark:bg-input/30"
        )}
      >
        {parts}
        {/* A trailing newline needs a character after it to take up a line. */}
        {"​"}
      </div>
      <Textarea
        ref={setRefs as Ref<HTMLTextAreaElement>}
        value={value}
        role={mentionsOn ? "combobox" : undefined}
        aria-expanded={mentionsOn ? open : undefined}
        aria-autocomplete={mentionsOn ? "list" : undefined}
        onScroll={(e) => {
          if (mirrorRef.current) mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
          if (open) setMenu(null);
          onScroll?.(e);
        }}
        onKeyDown={handleKeyDown}
        onSelect={(e) => {
          syncMenu(e.currentTarget);
          onSelect?.(e);
        }}
        onBlur={(e) => {
          setMenu(null);
          onBlur?.(e);
        }}
        className={cn(shared, "relative bg-transparent dark:bg-transparent", className)}
        {...props}
      />
      {open && menuPos && (
        <div
          role="listbox"
          aria-label="Reference images"
          className="absolute z-50 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
          style={{ top: menuPos.top, left: menuPos.left, width: MENU_WIDTH }}
          // Keep focus (and the caret) in the textarea while clicking an option.
          onMouseDown={(e) => e.preventDefault()}
        >
          {options.map((n, i) => (
            <button
              key={n}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(n)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                i === active && "bg-muted"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- blob: preview URL */}
              <img src={mentionImages![n - 1].previewUrl} alt="" className="size-7 shrink-0 rounded object-cover" />
              <span className="flex-1 font-medium">image{n}</span>
              <span className="text-xs text-muted-foreground">Ref image</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
