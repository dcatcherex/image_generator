"use client";

import { useState, type DragEvent } from "react";

// Drag-and-drop file target shared by the reference picker and the DESIGN.md import. Spread
// `dropProps` on the target element; `isDraggingOver` drives the highlight. Files failing
// `accept` are ignored, and the callback only runs when at least one file passes. A disabled
// target still swallows the drop, so a missed drop doesn't make the browser open the file.
export function useFileDrop({
  accept,
  onFiles,
  disabled = false,
}: {
  accept: (file: File) => boolean;
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const dropProps = {
    onDragOver(e: DragEvent<HTMLElement>) {
      e.preventDefault();
      if (disabled) {
        e.dataTransfer.dropEffect = "none";
        return;
      }
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
      if (disabled) return;
      const files = Array.from(e.dataTransfer.files).filter(accept);
      if (files.length > 0) onFiles(files);
    },
  };

  return { isDraggingOver, dropProps };
}
