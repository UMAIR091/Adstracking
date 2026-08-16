// The one definition of "how is this data source doing?".
//
// Before this existed, four screens each answered that question their own way:
// the dashboard's sync tile counted any row carrying `last_sync_error` text,
// the "Welcome back" banner counted `status in (error, revoked)`, the
// integrations stat tile counted `errored + needsReconnect`, and Integration
// health had its own table logic. On the same workspace that produced
// "3 sources failing", "1 source needs attention" and "0 sync errors" at once.
//
// The important rule, and the reason the counts disagreed: a source with no
// account selected yet is NOT a sync failure. The sync writes a message like
// "No ad account selected" into `last_sync_error`, which made setup-incomplete
// sources read as breakage. Setup-incomplete is its own state, checked before
// the error state so that message can't be double-counted.
//
// Client-safe on purpose: this module imports nothing, so client components
// (IntegrationCard, ConnectedAccountsTable) can classify without pulling the
// registry's server-side OAuth code into the browser bundle.

export type SourceHealth =
  /** Connected, account chosen, nothing wrong. */
  | "healthy"
  /** Token revoked or expired — the user must reconnect the provider. */
  | "needs_reconnect"
  /** Connected and configured, but the last sync actually failed. */
  | "sync_error"
  /** Connected, but no account/property chosen — it cannot sync yet. */
  | "needs_account";

export type SourceHealthInput = {
  /** `data_sources.status`: "connected" | "error" | "revoked". */
  status: string | null;
  /** `data_sources.last_sync_error`. */
  lastSyncError: string | null;
  /** The account/property id stored in config, if one has been chosen. */
  selectedAccountId: string | null;
};

export function sourceHealth({ status, lastSyncError, selectedAccountId }: SourceHealthInput): SourceHealth {
  // A revoked token blocks everything else, including account selection.
  if (status === "revoked") return "needs_reconnect";
  // Checked BEFORE the error state: every integration stores a selected
  // account/property, and until one is chosen the sync cannot run. The failure
  // text it leaves behind describes that gap, not a broken connection.
  if (!selectedAccountId) return "needs_account";
  if (status === "error" || lastSyncError) return "sync_error";
  return "healthy";
}

/** True for states the user has to act on. `healthy` is the only quiet one. */
export function needsAttention(h: SourceHealth): boolean {
  return h !== "healthy";
}

type Presentation = {
  /** Full sentence-ish label for tables and cards. */
  label: string;
  /** Compact label for badges in dense rows. */
  short: string;
  /** Maps to the existing Badge variants — no new colours. */
  variant: "success" | "warning" | "danger" | "info";
};

export const SOURCE_HEALTH: Record<SourceHealth, Presentation> = {
  healthy: { label: "Connected", short: "Connected", variant: "success" },
  needs_reconnect: { label: "Reconnect required", short: "Reconnect", variant: "danger" },
  sync_error: { label: "Sync error", short: "Sync error", variant: "warning" },
  // Deliberately still says "Connected" — the OAuth connection genuinely
  // succeeded — while making clear it cannot sync yet.
  needs_account: { label: "Connected — account selection required", short: "Account needed", variant: "info" },
};

export type HealthCounts = {
  total: number;
  healthy: number;
  needsAccount: number;
  syncError: number;
  needsReconnect: number;
  /** Everything that isn't healthy — the single number screens should show. */
  needsAttention: number;
};

export function countHealth(states: SourceHealth[]): HealthCounts {
  const healthy = states.filter((s) => s === "healthy").length;
  return {
    total: states.length,
    healthy,
    needsAccount: states.filter((s) => s === "needs_account").length,
    syncError: states.filter((s) => s === "sync_error").length,
    needsReconnect: states.filter((s) => s === "needs_reconnect").length,
    needsAttention: states.length - healthy,
  };
}
