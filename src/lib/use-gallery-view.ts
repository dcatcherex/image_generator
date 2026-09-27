"use client";

import { useEffect, useState } from "react";

export const GALLERY_COLUMNS_MIN = 2;
export const GALLERY_COLUMNS_MAX = 8;
const DEFAULT_COLUMNS = 5;

const VIEW_STORAGE_KEY = "gallery-view";
const COLUMNS_STORAGE_KEY = "gallery-columns";

export type GalleryViewMode = "grid" | "masonry";

// Shared by the gallery grid itself and the settings dialog, so both stay in sync and
// persist to the same localStorage keys regardless of which one changes the value.
export function useGalleryView() {
  const [view, setView] = useState<GalleryViewMode>("masonry");
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);

  // Mount-time read (not the initial useState value) to avoid a hydration mismatch between
  // the server-rendered default and whatever was previously stored in this browser.
  useEffect(() => {
    try {
      const storedView = localStorage.getItem(VIEW_STORAGE_KEY);
      const storedColumns = Number(localStorage.getItem(COLUMNS_STORAGE_KEY));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (storedView === "grid" || storedView === "masonry") setView(storedView);
      if (storedColumns >= GALLERY_COLUMNS_MIN && storedColumns <= GALLERY_COLUMNS_MAX) {
        setColumns(storedColumns);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {}
  }, [view]);

  useEffect(() => {
    try {
      localStorage.setItem(COLUMNS_STORAGE_KEY, String(columns));
    } catch {}
  }, [columns]);

  return { view, setView, columns, setColumns };
}
