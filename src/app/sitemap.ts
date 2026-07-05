import type { MetadataRoute } from "next";
import { COMPANY } from "@/lib/company";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? COMPANY.website;

const PUBLIC_PATHS = [
  "",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/cookies",
  "/security",
  "/data-deletion",
  "/login",
  "/signup",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: `${APP_URL}${path}`,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.5,
  }));
}
