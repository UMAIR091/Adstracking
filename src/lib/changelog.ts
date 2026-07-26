// Public changelog entries (launch audit P2-11). Newest first. Add an entry when
// you ship something customer-visible — it doubles as a trust + engagement signal.
export type ChangeType = "new" | "improved" | "fixed";

export type ChangelogEntry = {
  date: string; // ISO date
  version?: string;
  title: string;
  changes: { type: ChangeType; text: string }[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-07-26",
    title: "Launch-ready: faster, safer, more polished",
    changes: [
      { type: "new", text: "Guided onboarding, in-app Help Center, and contextual product tips." },
      { type: "new", text: "Automated scheduled reports with delivery history." },
      { type: "improved", text: "Up to ~50% smaller page bundles and a far faster dashboard." },
      { type: "improved", text: "White-label email from your own verified domain." },
      { type: "fixed", text: "More reliable data sync and report delivery at scale." },
    ],
  },
];
