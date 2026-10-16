// Browser-side call for revoking or replacing a report's public link. Returns
// the new token (null after a revoke).
export async function changeShareLink(reportId: string, action: "revoke" | "renew"): Promise<string | null> {
  const res = await fetch(`/api/reports/${reportId}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const body = (await res.json().catch(() => null)) as { shareToken?: string | null; error?: string } | null;
  if (!res.ok) throw new Error(body?.error ?? "Couldn't update the share link. Please try again.");
  return body?.shareToken ?? null;
}

export function shareUrlFor(token: string): string {
  return `${window.location.origin}/r/${token}`;
}
