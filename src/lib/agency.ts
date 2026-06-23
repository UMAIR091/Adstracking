import { createClient } from "@/lib/supabase/server";

export type Agency = {
  id: string;
  owner_id: string;
  name: string;
  logo_url: string | null;
  brand_color: string;
  website: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  footer_text: string | null;
};

// Returns the signed-in user and their agency, creating the agency on first login.
export async function getCurrentUserAndAgency() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, agency: null as Agency | null };

  const { data: existing } = await supabase
    .from("agencies")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (existing) return { user, agency: existing as Agency };

  const { data: created } = await supabase
    .from("agencies")
    .insert({ owner_id: user.id, name: "My Agency", contact_email: user.email })
    .select("*")
    .single();

  return { user, agency: (created ?? null) as Agency | null };
}
