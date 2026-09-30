import type { MetadataRoute } from "next";

// View-only beta shared by link: keep it out of search engines (layout.tsx also sets noindex).
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
