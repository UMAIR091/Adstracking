// Single source of truth for business/legal details used across legal pages,
// the footer, and the consent screen. Placeholder values are marked with
// [brackets] — update them here once and every page picks up the change.

export const COMPANY = {
  product: "ReportFlow",
  tagline: "White-label client reporting for marketing agencies.",
  // ── placeholders: update before launch ──
  legalName: "[Your Company Legal Name]",
  address: "[Registered business address]",
  jurisdiction: "[Your governing-law jurisdiction, e.g. Pakistan]",
  supportEmail: "admin@tryreportflow.com",
  privacyEmail: "admin@tryreportflow.com",
  // ── live values ──
  website: "https://tryreportflow.com",
};

// Bump when any legal document materially changes.
export const LEGAL_LAST_UPDATED = "July 4, 2026";

// The one-line promise repeated across legal pages, the consent screen and the
// footer. Keep the wording consistent everywhere.
export const DATA_PROMISE =
  "Your data is used only to generate your reports. It is never sold, rented, or shared with third parties for advertising.";

export const FOOTER_LINKS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Sample report", href: "/sample-report" },
      { label: "Sign in", href: "/login" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact & support", href: "/contact" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Refund Policy", href: "/refund" },
      { label: "Cookie Policy", href: "/cookies" },
      { label: "Data & Security", href: "/security" },
      { label: "Data Deletion", href: "/data-deletion" },
    ],
  },
];
