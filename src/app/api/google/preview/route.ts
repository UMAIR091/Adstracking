import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/googleTokens";
import { fetchGscReport } from "@/lib/google";

export const runtime = "nodejs";

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Pulls the last 28 days of Search Console data for a data source — used to
// verify the connection works and to power report generation later.
export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataSourceId = new URL(req.url).searchParams.get("dataSourceId");
  if (!dataSourceId) return NextResponse.json({ error: "dataSourceId required" }, { status: 400 });

  const { data: ds } = await supabase
    .from("data_sources")
    .select("id, type, config, access_token, refresh_token, token_expires_at")
    .eq("id", dataSourceId)
    .maybeSingle();
  if (!ds) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const siteUrl = (ds.config as { site_url?: string })?.site_url;
  if (!siteUrl) return NextResponse.json({ error: "No property selected" }, { status: 400 });

  try {
    const accessToken = await getValidAccessToken(supabase, ds);
    const report = await fetchGscReport(accessToken, siteUrl, isoDaysAgo(28), isoDaysAgo(1));
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
