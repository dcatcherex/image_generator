"use client";

import { useCallback, useEffect, useState } from "react";
import type { CostStats } from "./pricing";

// Recorded-cost medians used to calibrate the pre-generation estimate. Failure just leaves
// `stats` null, which falls back to the official token table.
export function useCostStats() {
  const [stats, setStats] = useState<CostStats | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/cost-stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setStats(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { stats, refresh };
}
