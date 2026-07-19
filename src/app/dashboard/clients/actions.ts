"use server";

// Server action for creating a client, so the plan client-limit is enforced on
// the server (the form previously inserted directly from the browser). Editing
// stays a direct RLS update in the form — only creation is gated.
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { checkClientLimit } from "@/lib/billing/limits";

export type NewClient = {
  name: string;
  logo_url: string | null;
  email: string | null;
  website: string | null;
  notes: string | null;
};

export type CreateClientResult =
  | { ok: true; id: string }
  | { ok: false; error: string; upgrade?: boolean };

export async function createClientAction(input: NewClient): Promise<CreateClientResult> {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return { ok: false, error: "You're signed out. Please sign in again." };
  if (!input.name?.trim()) return { ok: false, error: "Client name is required." };

  const supabase = createClient();

  // Enforce the plan's client/workspace limit (and trial-expired lockout).
  const limit = await checkClientLimit(supabase, agency.id);
  if (!limit.allowed) return { ok: false, error: limit.reason ?? "Client limit reached.", upgrade: true };

  const { data, error } = await supabase
    .from("clients")
    .insert({
      agency_id: agency.id,
      name: input.name.trim(),
      logo_url: input.logo_url,
      email: input.email,
      website: input.website,
      notes: input.notes,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  return { ok: true, id: data.id };
}
