"use client";

import { useCallback, useState } from "react";
import type { GenerationStreamEvent, ImageRecord } from "./types";

export function useImageStream() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [partialB64, setPartialB64] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (
      payload: Record<string, unknown>,
      onDone: (image: ImageRecord) => void
    ) => {
      setIsGenerating(true);
      setPartialB64(null);
      setError(null);

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

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
              onDone(event.image);
            } else if (event.type === "error") {
              setError(event.message);
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Generation failed");
      } finally {
        setIsGenerating(false);
      }
    },
    []
  );

  return { generate, isGenerating, partialB64, error };
}
