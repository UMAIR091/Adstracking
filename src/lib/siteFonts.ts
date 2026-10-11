import { IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";

// Typefaces for the public marketing pages only. They are imported by the pages
// that use them rather than the root layout, so the signed-in app never
// downloads them. Self-hosted by next/font, so the CSP needs no font host.
const sans = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-site", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-site-mono", display: "swap" });

/** Put on a marketing page's root element, with `font-site`. */
export const siteFonts = `${sans.variable} ${mono.variable}`;
