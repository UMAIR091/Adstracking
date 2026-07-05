import type { MetadataRoute } from "next";
import { COMPANY } from "@/lib/company";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? COMPANY.website;

// Public marketing/legal pages are crawlable; the app, API, and private
// client-report share links are not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard/", "/api/", "/r/"],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
