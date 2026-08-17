// Renders the four data-volume scenarios to PDF so the actual generated
// documents can be read rather than inferred from unit tests.
// Run: npx tsx scripts/qa-reports.tsx [outDir]
//
//   1-sparse             barely any data across two sources
//   2-one-channel-rich   a single source carrying a lot
//   3-multi-moderate     several channels, moderate depth
//   4-rich-multi         several channels, all deep, with AI insights
//
// The fixtures live in ./qa-scenarios so the on-screen report (qa-web.tsx) is
// checked against exactly the same data.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderReportPdf } from "../src/lib/pdf";
import { BRANDING, CLIENT, PERIOD, SCENARIOS } from "./qa-scenarios";

const outDir = process.argv[2] ?? ".qa";
mkdirSync(outDir, { recursive: true });

(async () => {
  for (const sc of SCENARIOS) {
    const buf = await renderReportPdf({
      data: sc.data,
      branding: BRANDING,
      clientName: CLIENT,
      title: sc.title,
      period: PERIOD,
      generatedAt: "July 31, 2026",
    });
    const file = join(outDir, `${sc.name}.pdf`);
    writeFileSync(file, buf);
    console.log(`${file}  ${(buf.length / 1024).toFixed(0)} KB`);
  }
})();
