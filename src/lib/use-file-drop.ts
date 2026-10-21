"use client";

import { useState, type DragEvent } from "react";

// Drag-and-drop file target shared by the reference picker and the DESIGN.md import. Spread
// `dropProps` on the target element; `isDraggingOver` drives the highlight. Files failing
// `accept` are ignored, and the callback only runs when at least one file passes.
export function useFileDrop({
  accept,
  onFiles,
}: {
  accept: (file: File) => boolean;
  onFiles: (files: File[]) => void;
}) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const dropProps = {
    onDragOver(e: DragEvent<HTMLElement>) {
      e.preventDefault();
      setIsDraggingOver(true);
    },
    onDragLeave(e: DragEvent<HTMLElement>) {
      // dragleave also fires when moving onto a child; only clear once the pointer leaves.
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setIsDraggingOver(false);
    },
    onDrop(e: DragEvent<HTMLElement>) {
      e.preventDefault();
      setIsDraggingOver(false);
      const files = Array.from(e.dataTransfer.files).filter(accept);
      if (files.length > 0) onFiles(files);
    },
  };

  return { isDraggingOver, dropProps };
}
