import type { MetadataRoute } from "next";
import { COMPANY } from "@/lib/company";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? COMPANY.website;

const PUBLIC_PATHS = [
  "",
  "/pricing",
  "/sample-report",
  "/help",
  "/changelog",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/refund",
  "/cookies",
  "/security",
  "/data-deletion",
  "/login",
  "/signup",
];

// The date the public pages last changed in a way worth re-crawling. Search
// engines show a cached title and description until they crawl again, so this
// is what tells them the pages are stale — the rename to Anavyst is why it is
// set here. Bump it whenever public copy or branding changes again.
const LAST_MODIFIED = "2026-09-22";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: `${APP_URL}${path}`,
    lastModified: LAST_MODIFIED,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.5,
  }));
}
