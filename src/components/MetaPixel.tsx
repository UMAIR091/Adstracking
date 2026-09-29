"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  META_PIXEL_ID,
  loadMetaPixel,
  metaTrack,
  pixelAllowedOnPath,
  visitorAllowsAdMeasurement,
} from "@/lib/metaPixel";

// Mounted once in the root layout. Loads the Meta Pixel the first time the
// visitor reaches a page it may run on (see lib/metaPixel.ts for which), then
// sends one PageView per such page. Production only, like GoogleAnalytics.
export function MetaPixel() {
  const pathname = usePathname();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !META_PIXEL_ID) return;
    if (!pathname || !pixelAllowedOnPath(pathname) || !visitorAllowsAdMeasurement()) return;
    loadMetaPixel();
    metaTrack("PageView");
    if (pathname === "/pricing") metaTrack("ViewContent", { content_name: "Pricing", content_category: "pricing" });
  }, [pathname]);

  return null;
}
