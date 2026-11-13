"use client";

import { useMemo, useRef, type ComponentProps } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";
import { findPlaceholders } from "@/lib/placeholders";

/**
 * A Textarea that tints its `<placeholder>` / `[placeholder]` spans. A textarea can't style
 * part of its text, so a mirror layer behind it renders the same text invisibly with the
 * placeholders marked, kept aligned by sharing padding, font, wrapping and scroll position.
 */
export function PromptTextarea({
  value,
  className,
  onScroll,
  ref,
  ...props
}: Omit<ComponentProps<typeof Textarea>, "value"> & { value: string }) {
  const mirrorRef = useRef<HTMLDivElement>(null);

  const parts = useMemo(() => {
    const out: { text: string; mark: boolean }[] = [];
    let at = 0;
    for (const r of findPlaceholders(value)) {
      if (r.start > at) out.push({ text: value.slice(at, r.start), mark: false });
      out.push({ text: value.slice(r.start, r.end), mark: true });
      at = r.end;
    }
    out.push({ text: value.slice(at), mark: false });
    return out;
  }, [value]);

  // Both layers reserve the scrollbar's space so their text wraps at the same width.
  const shared = "[scrollbar-gutter:stable] [scrollbar-width:thin] whitespace-pre-wrap break-words";

  return (
    <div className="relative">
      <div
        ref={mirrorRef}
        aria-hidden
        className={cn(
          shared,
          "pointer-events-none absolute inset-0 overflow-hidden rounded-lg border border-transparent px-2.5 py-2 text-base text-transparent md:text-sm dark:bg-input/30"
        )}
      >
        {parts.map((p, i) =>
          p.mark ? (
            <mark key={i} className="rounded-sm bg-amber-300/50 text-transparent dark:bg-amber-400/25">
              {p.text}
            </mark>
          ) : (
            p.text
          )
        )}
        {/* A trailing newline needs a character after it to take up a line. */}
        {"​"}
      </div>
      <Textarea
        ref={ref}
        value={value}
        onScroll={(e) => {
          if (mirrorRef.current) mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
          onScroll?.(e);
        }}
        className={cn(shared, "relative bg-transparent dark:bg-transparent", className)}
        {...props}
      />
    </div>
  );
}
