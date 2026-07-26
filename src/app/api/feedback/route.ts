import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";

export const runtime = "nodejs";

const TYPES = new Set(["feedback", "bug", "feature"]);

// In-app feedback / bug reports (launch audit P2-9). RLS-scoped insert into the
// feedback table; rate-limited to prevent spam.
export async function POST(req: Request) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(`feedback:${agency.id}`, { limit: 10, windowSeconds: 300 });
  if (!rl.allowed) return tooManyRequests(rl.windowSeconds);

  const body = (await req.json().catch(() => null)) as { type?: string; message?: string; url?: string } | null;
  const type = body?.type && TYPES.has(body.type) ? body.type : "feedback";
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 4000) : "";
  const url = typeof body?.url === "string" ? body.url.slice(0, 500) : null;
  if (message.length < 3) return NextResponse.json({ error: "Please add a bit more detail." }, { status: 400 });

  const supabase = createClient();
  const { error } = await supabase.from("feedback").insert({
    agency_id: agency.id,
    user_id: user.id,
    type,
    message,
    url,
  });
  if (error) return NextResponse.json({ error: "Couldn't submit right now. Please try again." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
