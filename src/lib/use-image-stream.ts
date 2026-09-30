"use client";

import { useCallback, useState } from "react";
import type { GenerationStreamEvent, ImageRecord } from "./types";

export function useImageStream() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [partialB64, setPartialB64] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Number of images still expected in the current batch (n > 1 requests skip live
  // previews, so the gallery just shows this many pulsing placeholder tiles and
  // counts them down as each "done" event arrives).
  const [pendingCount, setPendingCount] = useState(0);

  const generate = useCallback(
    async (
      payload: Record<string, unknown>,
      onDone: (image: ImageRecord, warning?: string) => void
    ): Promise<string | null> => {
      const requested = Math.max(Number(payload.n) || 1, 1);
      setIsGenerating(true);
      setPartialB64(null);
      setError(null);
      setPendingCount(requested);
      // Returned as well as stored: callers awaiting generate() would otherwise read the
      // `error` state from the render before the request started.
      let failure: string | null = null;

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        // Validation errors (bad size, JPEG + transparent, ...) come back as plain JSON
        // before any stream starts.
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || `Generation failed (${res.status})`);
        }
        if (!res.body) throw new Error("No response stream");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";

          for (const chunk of chunks) {
            const line = chunk.trim();
            if (!line.startsWith("data:")) continue;
            const json = line.slice(5).trim();
            if (!json) continue;
            const event = JSON.parse(json) as GenerationStreamEvent;

            if (event.type === "partial") {
              setPartialB64(event.b64);
            } else if (event.type === "done") {
              setPartialB64(null);
              setPendingCount((prev) => Math.max(0, prev - 1));
              onDone(event.image, event.warning);
            } else if (event.type === "error") {
              failure = event.message;
              setError(event.message);
            }
          }
        }
      } catch (err) {
        failure = err instanceof Error ? err.message : "Generation failed";
        setError(failure);
      } finally {
        setIsGenerating(false);
        setPendingCount(0);
      }
      return failure;
    },
    []
  );

  return { generate, isGenerating, partialB64, error, pendingCount };
}
