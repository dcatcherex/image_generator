"use client";

import { useEffect, useState } from "react";

export const PANEL_OPTIONS = [
  { id: "economy", label: "Economy mode" },
  { id: "preview", label: "Live preview" },
  { id: "batch", label: "Batch (n)" },
  { id: "size", label: "Size" },
  { id: "tier", label: "Size tier" },
  { id: "quality", label: "Quality" },
  { id: "format", label: "Format" },
  { id: "compression", label: "Compression" },
  { id: "background", label: "Background" },
  { id: "tag", label: "Tag" },
  { id: "model", label: "Model" },
] as const;

export type PanelOptionId = (typeof PANEL_OPTIONS)[number]["id"];
export type PanelOptionVisibility = Record<PanelOptionId, boolean>;

const STORAGE_KEY = "panel-options-visibility";

const DEFAULT_VISIBILITY = Object.fromEntries(
  PANEL_OPTIONS.map((o) => [o.id, true])
) as PanelOptionVisibility;

// Which generate-panel options are shown. Hidden options keep using their current/default
// value; they just aren't rendered. Persisted per browser like the gallery view settings.
export function usePanelOptions() {
  const [visibility, setVisibility] = useState<PanelOptionVisibility>(DEFAULT_VISIBILITY);

  // Mount-time read to avoid a hydration mismatch with the server-rendered defaults.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setVisibility({ ...DEFAULT_VISIBILITY, ...JSON.parse(raw) });
    } catch {}
  }, []);

  function setOptionVisible(id: PanelOptionId, visible: boolean) {
    setVisibility((prev) => {
      const next = { ...prev, [id]: visible };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  return { visibility, setOptionVisible };
}
