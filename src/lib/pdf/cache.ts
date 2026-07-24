// Cached report PDF rendering (audit #3).
//
// The public /r/<token>/pdf route used to re-render the PDF (fontkit + a wasm
// layout engine) on EVERY request. That is both slow and a cost-DoS surface on
// an unauthenticated endpoint. Here we render once, store the bytes in the
// private `report-pdfs` Storage bucket, and serve the stored object on
// subsequent hits — re-rendering only when the report's rendered inputs change
// (tracked by a content hash on reports.pdf_cached_hash).
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderReportPdf } from "./index";
import type { Branding } from "./index";

const BUCKET = "report-pdfs";
const objectPath = (reportId: string) => `${reportId}.pdf`;

export type RenderArgs = {
  data: unknown;
  branding: Branding;
  clientName: string;
  title: string;
  period: { start: string; end: string };
};

// Hash of everything that affects the rendered output. generatedAt is excluded
// on purpose so a cached PDF isn't invalidated merely by the clock advancing.
function renderHash(args: RenderArgs): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ data: args.data, branding: args.branding, clientName: args.clientName, title: args.title, period: args.period }))
    .digest("hex");
}

export type CacheableReport = { id: string; pdf_cached_hash: string | null };

// Returns the report PDF, served from cache when the stored object matches the
// current content hash, otherwise rendered fresh and written back to the cache.
// Cache writes are best-effort — a Storage failure still returns a valid PDF.
export async function getOrRenderReportPdf(
  admin: SupabaseClient,
  report: CacheableReport,
  args: RenderArgs
): Promise<Buffer> {
  const hash = renderHash(args);

  if (report.pdf_cached_hash === hash) {
    const { data, error } = await admin.storage.from(BUCKET).download(objectPath(report.id));
    if (!error && data) {
      const buf = Buffer.from(await data.arrayBuffer());
      if (buf.length) return buf;
    }
    // Fall through to a re-render if the object vanished or was empty.
  }

  const pdf = await renderReportPdf(args);
  try {
    await admin.storage.from(BUCKET).upload(objectPath(report.id), pdf, {
      contentType: "application/pdf",
      upsert: true,
    });
    await admin.from("reports").update({ pdf_cached_hash: hash, pdf_cached_at: new Date().toISOString() }).eq("id", report.id);
  } catch {
    /* best-effort cache write */
  }
  return pdf;
}
