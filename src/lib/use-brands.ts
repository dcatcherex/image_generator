"use client";

import { useCallback, useEffect, useState } from "react";
import type { BrandRecord } from "@/lib/brands";

const ACTIVE_BRAND_STORAGE_KEY = "active-brand";

/** Header switcher value: every image, only unbranded ones, or one brand's id. */
export type ActiveBrand = "all" | "none" | (string & {});

// Brands are owner-only (every /api/brands route 403s for viewers), so nothing is fetched or
// restored unless `enabled`. The list includes archived brands so the manage dialog can
// restore them; the switcher filters them out.
export function useBrands(enabled: boolean) {
  const [brands, setBrands] = useState<BrandRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [storedActive, setStoredActive] = useState<ActiveBrand>("all");

  useEffect(() => {
    if (!enabled) return;
    fetch("/api/brands?archived=true")
      .then((r) => (r.ok ? r.json() : { brands: [] }))
      .then((data) => setBrands(data.brands ?? []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [enabled]);

  // Mount-time read (not the initial useState value) to avoid a hydration mismatch.
  useEffect(() => {
    if (!enabled) return;
    try {
      const stored = localStorage.getItem(ACTIVE_BRAND_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setStoredActive(stored);
    } catch {}
  }, [enabled]);

  const setActive = useCallback((value: ActiveBrand) => {
    setStoredActive(value);
    try {
      localStorage.setItem(ACTIVE_BRAND_STORAGE_KEY, value);
    } catch {}
  }, []);

  // A stored brand that was archived or deleted (maybe in another tab) falls back to "all"
  // rather than silently branding generations with a brand the switcher no longer shows.
  const active: ActiveBrand =
    storedActive === "all" ||
    storedActive === "none" ||
    !loaded ||
    brands.some((b) => b.id === storedActive && !b.archivedAt)
      ? storedActive
      : "all";
  const activeBrand = brands.find((b) => b.id === active) ?? null;

  /** Inserts or replaces a brand after a create/update, keeping the list sorted by name. */
  const upsertBrand = useCallback((brand: BrandRecord) => {
    setBrands((prev) =>
      [...prev.filter((b) => b.id !== brand.id), brand].sort((a, b) => a.name.localeCompare(b.name))
    );
  }, []);

  const removeBrand = useCallback((id: string) => {
    setBrands((prev) => prev.filter((b) => b.id !== id));
  }, []);

  return { brands, loaded, active, activeBrand, setActive, upsertBrand, removeBrand };
}

/** The colour shown as a brand's dot: its "primary" colour if it has one, else the first. */
export function brandDotColor(brand: BrandRecord): string | null {
  const colors = brand.kit.colors;
  return (colors.find((c) => /primary/i.test(c.role)) ?? colors[0])?.hex ?? null;
}
