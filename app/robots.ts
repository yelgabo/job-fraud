import type { MetadataRoute } from "next"

// No token-gated or API surface in crawlers: /audit URLs contain AUDIT_TOKEN, which must not
// end up in indexes or search logs. Everything public is allowed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: ["/audit/", "/api/"],
      },
    ],
  }
}
