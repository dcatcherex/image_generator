"use client";

import { useEffect, useState } from "react";
import { DEFAULT_MODEL, MODEL } from "@/lib/openai";

// `defaultVisible` is whether the option is shown before the user changes it in Settings.
export const PANEL_OPTIONS = [
  { id: "presets", label: "Presets", defaultVisible: true },
  { id: "exactText", label: "Exact text", defaultVisible: false },
  { id: "economy", label: "Economy mode", defaultVisible: false },
  { id: "preview", label: "Live preview", defaultVisible: false },
  { id: "batch", label: "Batch (n)", defaultVisible: false },
  { id: "size", label: "Size", defaultVisible: true },
  { id: "tier", label: "Size tier", defaultVisible: true },
  { id: "quality", label: "Quality", defaultVisible: true },
  { id: "complexity", label: "Complexity (GPT Image 2.6)", defaultVisible: true },
  { id: "format", label: "Format", defaultVisible: true },
  { id: "compression", label: "Compression", defaultVisible: false },
  { id: "background", label: "Background", defaultVisible: true },
  { id: "tag", label: "Tag", defaultVisible: false },
  { id: "model", label: "Model", defaultVisible: false },
  { id: "preserve", label: "Change only / Preserve", defaultVisible: true },
  { id: "compare", label: "Compare models", defaultVisible: false },
] as const;

export type PanelOptionId = (typeof PANEL_OPTIONS)[number]["id"];
export type PanelOptionVisibility = Record<PanelOptionId, boolean>;

const STORAGE_KEY = "panel-options-visibility";
const DEFAULT_MODEL_KEY = "panel-default-model";

function isKnownModel(value: unknown): value is string {
  return typeof value === "string" && (MODEL as readonly string[]).includes(value);
}

const DEFAULT_VISIBILITY = Object.fromEntries(
  PANEL_OPTIONS.map((o) => [o.id, o.defaultVisible])
) as PanelOptionVisibility;

// Which generate-panel options are shown. Hidden options keep using their current/default
// value; they just aren't rendered. Persisted per browser like the gallery view settings.
export function usePanelOptions() {
  const [visibility, setVisibility] = useState<PanelOptionVisibility>(DEFAULT_VISIBILITY);
  // The model the generate panel starts on. A stored id that's no longer offered is ignored.
  const [defaultModel, setDefaultModelState] = useState<string>(DEFAULT_MODEL);

  // Mount-time read to avoid a hydration mismatch with the server-rendered defaults.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setVisibility({ ...DEFAULT_VISIBILITY, ...JSON.parse(raw) });
    } catch {}
    try {
      const stored = localStorage.getItem(DEFAULT_MODEL_KEY);
      if (isKnownModel(stored)) setDefaultModelState(stored);
    } catch {}
  }, []);

  function setDefaultModel(model: string) {
    if (!isKnownModel(model)) return;
    setDefaultModelState(model);
    try {
      localStorage.setItem(DEFAULT_MODEL_KEY, model);
    } catch {}
  }

  function setOptionVisible(id: PanelOptionId, visible: boolean) {
    setVisibility((prev) => {
      const next = { ...prev, [id]: visible };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  function resetVisibility() {
    setVisibility(DEFAULT_VISIBILITY);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  return { visibility, setOptionVisible, resetVisibility, defaultModel, setDefaultModel };
}
