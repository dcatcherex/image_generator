import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Blob URLs carry a random suffix and are never overwritten, so optimized variants can
    // be cached for a long time — fewer re-transformations against the Hobby-plan quota.
    minimumCacheTTL: 2678400, // 31 days
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
};

export default nextConfig;
