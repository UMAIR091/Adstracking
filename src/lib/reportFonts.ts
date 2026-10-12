import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

// Typefaces for the client report only (Geist + Geist Mono, self-hosted by the
// `geist` package through next/font/local; this Next version's Google list has
// no Geist). Scoped to the report wrapper, so the app and the marketing site
// keep their own faces.
export const reportFonts = `${GeistSans.variable} ${GeistMono.variable}`;
