// Cross-client identity, proven on the rendered output.
//
// Two genuinely different client records — different names, different logos —
// rendered A → B → A, to both surfaces. The check is not that the data was
// loaded: it is that each document embeds ITS OWN client's image bytes and not
// the other's, and carries its own client's name.
//
// Run: npx tsx --tsconfig scripts/tsconfig.qa.json scripts/qa-client-identity.tsx
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import zlib from "node:zlib";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { renderReportPdf } from "../src/lib/pdf";
import { ReportDocument } from "../src/components/ReportDocument";
import { BRANDING, PERIOD, SCENARIOS } from "./qa-scenarios";

// ── Two distinguishable logos ─────────────────────────────────────────────
// Minimal single-colour PNGs, built here so each client's mark is a different
// sequence of bytes and can be searched for in the output.
function solidPng(r: number, g: number, b: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, c]);
  };
  const size = 8;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const raw = Buffer.concat(
    Array.from({ length: size }, () =>
      Buffer.concat([Buffer.from([0]), Buffer.concat(Array.from({ length: size }, () => Buffer.from([r, g, b])))]),
    ),
  );
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const dataUri = (png: Buffer) => `data:image/png;base64,${png.toString("base64")}`;

const CLIENTS = [
  { key: "A", name: "Acme Running Co.", png: solidPng(0xd9, 0x27, 0x1a) }, // red
  { key: "B", name: "Bluefin Coffee", png: solidPng(0x0f, 0x76, 0xc7) },   // blue
];

// The richest scenario, so the cover sits on a full report.
const scenario = SCENARIOS.find((s) => s.name === "4-rich-multi")!;

// ── Does the PDF actually embed these bytes? ──────────────────────────────
// react-pdf writes the image as a Flate-compressed stream; inflate every stream
// and look for the pixel run this client's PNG decodes to.
function embeddedColours(pdf: Buffer): string[] {
  const raw = pdf.toString("latin1");
  const found: string[] = [];
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  const bodies: Buffer[] = [];
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) continue;
    const slice = pdf.subarray(start, end);
    bodies.push(slice);
    try {
      bodies.push(zlib.inflateSync(slice));
    } catch {
      /* not flate */
    }
  }
  for (const c of CLIENTS) {
    // Two consecutive pixels of this client's colour, as the image decodes to.
    const pixel = Buffer.from(
      c.key === "A" ? [0xd9, 0x27, 0x1a, 0xd9, 0x27, 0x1a] : [0x0f, 0x76, 0xc7, 0x0f, 0x76, 0xc7],
    );
    if (bodies.some((b) => b.includes(pixel))) found.push(c.key);
  }
  return found;
}

const outDir = ".qa/identity";
mkdirSync(outDir, { recursive: true });

(async () => {
  const sequence = ["A", "B", "A"] as const;
  const results: string[] = [];
  let failures = 0;

  for (let step = 0; step < sequence.length; step++) {
    const c = CLIENTS.find((x) => x.key === sequence[step])!;
    const logo = dataUri(c.png);
    const title = `${c.name} — Cross-Channel Report · July 2026`;

    const pdf = await renderReportPdf({
      data: scenario.data,
      branding: BRANDING,
      clientName: c.name,
      clientLogoUrl: logo,
      title,
      period: PERIOD,
      generatedAt: "July 31, 2026",
    });
    const pdfPath = join(outDir, `${step + 1}-client-${c.key}.pdf`);
    writeFileSync(pdfPath, pdf);

    const html = renderToStaticMarkup(
      React.createElement(ReportDocument, {
        branding: {
          name: BRANDING.name, logo_url: BRANDING.logo_url, brand_color: BRANDING.brand_color,
          website: BRANDING.website, footer_text: BRANDING.footer_text,
        },
        clientName: c.name,
        clientLogoUrl: logo,
        title,
        period: PERIOD,
        data: scenario.data,
      }),
    );
    writeFileSync(join(outDir, `${step + 1}-client-${c.key}.html`), html);

    // ── Assertions on the rendered artefacts ──
    const colours = embeddedColours(pdf);
    const pdfHasOwn = colours.includes(c.key);
    const pdfHasOther = colours.some((k) => k !== c.key);
    const webHasOwn = html.includes(logo);
    const webHasOtherLogo = CLIENTS.some((o) => o.key !== c.key && html.includes(dataUri(o.png)));
    const webHasOwnName = html.includes(`Prepared for ${c.name}`);
    const webHasOtherName = CLIENTS.some((o) => o.key !== c.key && html.includes(`Prepared for ${o.name}`));
    // The agency must still be the primary brand.
    const agencyIntact = html.includes(BRANDING.name) && html.includes(BRANDING.brand_color);

    const ok = pdfHasOwn && !pdfHasOther && webHasOwn && !webHasOtherLogo && webHasOwnName && !webHasOtherName && agencyIntact;
    if (!ok) failures += 1;
    results.push(
      `${step + 1}. Client ${c.key} (${c.name})\n` +
        `     PDF   logo: ${pdfHasOwn ? "own ✓" : "MISSING ✗"}${pdfHasOther ? "  OTHER CLIENT'S LOGO PRESENT ✗" : "  no other ✓"}\n` +
        `     Web   logo: ${webHasOwn ? "own ✓" : "MISSING ✗"}${webHasOtherLogo ? "  OTHER ✗" : "  no other ✓"}\n` +
        `     Name      : ${webHasOwnName ? "own ✓" : "MISSING ✗"}${webHasOtherName ? "  OTHER ✗" : "  no other ✓"}\n` +
        `     Agency    : ${agencyIntact ? "primary branding intact ✓" : "AGENCY BRANDING LOST ✗"}`,
    );
  }

  // ── And with no client logo at all ──
  const bare = await renderReportPdf({
    data: scenario.data, branding: BRANDING, clientName: "Cedar Dental",
    clientLogoUrl: null, title: "Cedar Dental — Report", period: PERIOD, generatedAt: "July 31, 2026",
  });
  writeFileSync(join(outDir, "4-no-client-logo.pdf"), bare);
  const bareColours = embeddedColours(bare);
  const bareOk = bareColours.length === 0;
  if (!bareOk) failures += 1;
  results.push(`4. No client logo\n     PDF   ${bareOk ? "omitted, no logo borrowed ✓" : "BORROWED A LOGO ✗ " + bareColours.join(",")}`);

  console.log(results.join("\n\n"));
  console.log(`\n${failures === 0 ? "PASS" : `FAIL (${failures})`} — artefacts in ${outDir}/`);
  if (failures) process.exitCode = 1;
})();

