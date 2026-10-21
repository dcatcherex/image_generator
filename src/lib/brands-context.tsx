"use client";

import { createContext, useContext } from "react";
import type { BrandRecord } from "./brands";

// The owner's brands (archived included), for gallery cards and the lightbox to show an
// image's brand and reassign it. Always empty for public viewers, who never get brand data.
const BrandsContext = createContext<BrandRecord[]>([]);

export const BrandsProvider = BrandsContext.Provider;

export function useBrandList(): BrandRecord[] {
  return useContext(BrandsContext);
}
