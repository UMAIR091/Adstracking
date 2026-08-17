// Renders the on-screen ReportDocument for the same four scenarios as
// qa-reports.tsx, to static HTML, so the web report is checked against real
// output too. Charts render as empty containers here (no layout in jsdom-less
// SSR) — this harness is for the text, sections and ordering, which is where the
// summary and commentary logic lives.
// Run: npx tsx --tsconfig scripts/tsconfig.qa.json scripts/qa-web.tsx [outDir]
// (the local tsconfig switches on React's automatic JSX runtime, which Next
// supplies in the app but tsx does not infer from the root config)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportDocument } from "../src/components/ReportDocument";
import { BRANDING, CLIENT, PERIOD, SCENARIOS } from "./qa-scenarios";

const outDir = process.argv[2] ?? ".qa";
mkdirSync(outDir, { recursive: true });

for (const sc of SCENARIOS) {
  const html = renderToStaticMarkup(
    React.createElement(ReportDocument, {
      branding: {
        name: BRANDING.name,
        logo_url: BRANDING.logo_url,
        brand_color: BRANDING.brand_color,
        website: BRANDING.website,
        footer_text: BRANDING.footer_text,
      },
      clientName: CLIENT,
      title: sc.title,
      period: PERIOD,
      data: sc.data,
    }),
  );
  const file = join(outDir, `${sc.name}.html`);
  writeFileSync(
    file,
    `<!doctype html><meta charset="utf-8"><title>${sc.title}</title>` +
      `<script src="https://cdn.tailwindcss.com"></script><body class="bg-slate-100 p-6">${html}</body>`,
  );
  console.log(`${file}  ${(html.length / 1024).toFixed(0)} KB`);
}
