"use server";

// Server actions for the two client operations that change how many active
// clients count against the plan: creating one and restoring an archived one.
// Tenants can't insert clients or un-archive them directly (migration 0038), so
// these are the only way in. Each checks the limit, then writes through a
// function that re-counts under a per-agency lock (migration 0037), so
// concurrent requests can't all squeeze past the same "4 of 5".
//
// Editing a client's details stays a direct RLS update in the form.
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

export type SetClientArchivedResult =
  | { ok: true }
  | { ok: false; error: string; upgrade?: boolean };

const SIGNED_OUT = "You're signed out. Please sign in again.";

export async function createClientAction(input: NewClient): Promise<CreateClientResult> {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return { ok: false, error: SIGNED_OUT };
  if (!input.name?.trim()) return { ok: false, error: "Client name is required." };

  const supabase = createClient();

  // Enforce the plan's client/workspace limit (and trial-expired lockout).
  const limit = await checkClientLimit(supabase, agency.id);
  if (!limit.allowed) return { ok: false, error: limit.reason ?? "Client limit reached.", upgrade: true };

  const { data: id, error } = await createAdminClient().rpc("create_client_within_limit", {
    p_agency: agency.id,
    p_max_clients: limit.limit ?? 0,
    p_name: input.name.trim(),
    p_logo_url: input.logo_url,
    p_email: input.email,
    p_website: input.website,
    p_notes: input.notes,
  });
  if (error) return { ok: false, error: error.message };

  // null: a concurrent request took the last slot after the check above.
  if (!id) {
    const now = await checkClientLimit(supabase, agency.id);
    return { ok: false, error: now.reason ?? "Client limit reached.", upgrade: true };
  }

  return { ok: true, id: id as string };
}

export async function setClientArchivedAction(clientId: string, archived: boolean): Promise<SetClientArchivedResult> {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return { ok: false, error: SIGNED_OUT };

  const supabase = createClient();

  if (archived) {
    // Archiving frees a slot, so it needs no plan check.
    const { error } = await supabase.from("clients").update({ archived: true }).eq("id", clientId).eq("agency_id", agency.id);
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  const limit = await checkClientLimit(supabase, agency.id);
  if (!limit.allowed) return { ok: false, error: limit.reason ?? "Client limit reached.", upgrade: true };

  const { data: outcome, error } = await createAdminClient().rpc("restore_client_within_limit", {
    p_agency: agency.id,
    p_client: clientId,
    p_max_clients: limit.limit ?? 0,
  });
  if (error) return { ok: false, error: error.message };
  if (outcome === "not_found") return { ok: false, error: "Client not found." };
  if (outcome === "limit") {
    const now = await checkClientLimit(supabase, agency.id);
    return { ok: false, error: now.reason ?? "Client limit reached.", upgrade: true };
  }

  return { ok: true };
}
