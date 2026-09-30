"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "live-preview";

// Live preview streams partial frames that each bill 100 output tokens, so it's opt-in
// (default off) and remembered per browser like the other panel settings.
export function useLivePreview() {
  const [preview, setPreviewState] = useState(false);

  // Mount-time read to avoid a hydration mismatch with the server-rendered default.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(STORAGE_KEY) === "true") setPreviewState(true);
    } catch {}
  }, []);

  function setPreview(on: boolean) {
    setPreviewState(on);
    try {
      localStorage.setItem(STORAGE_KEY, String(on));
    } catch {}
  }

  return { preview, setPreview };
}
