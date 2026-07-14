import type { SupabaseClient } from "@supabase/supabase-js";
import { getIntegration, syncableTypes } from "@/lib/integrations/registry";
import { syncDataSource, type SyncableSource } from "@/lib/sync";

// Bounded, provider-aware batch sync used by the cron. Instead of loading every
// connected source and processing them one-by-one in a single 60s request (which
// does not scale past a few dozen sources), each invocation:
//
//   1. claims only the N *stalest* sources (ordered by last_sync_attempt_at),
//   2. groups them by provider quota family,
//   3. runs each family with its own small concurrency limit + jitter.
//
// Because syncDataSource stamps last_sync_attempt_at on every attempt (success
// or failure), claimed sources rotate to the back of the queue and the next
// invocation picks up the next stalest set — nothing is permanently skipped, and
// a persistently failing source can't starve the rest. Scaling to thousands of
// sources is then just a matter of batch size × cron frequency.

// How many sources one invocation processes. Keep batch × concurrency well
// within the route's maxDuration. Override with SYNC_BATCH_SIZE.
export function batchSize(): number {
  const n = Number(process.env.SYNC_BATCH_SIZE);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 25;
}

// Sources sharing a provider also share that provider's API quota, so they must
// share a concurrency budget. Google products all hit the same Cloud project;
// Meta products share one app. Everything else gets a conservative default.
const GOOGLE_FAMILY = new Set(["gsc", "ga4", "google_ads", "gbp", "sheets", "youtube_analytics", "bigquery"]);
const META_FAMILY = new Set(["meta_ads", "instagram", "facebook"]);

const GROUP_CONCURRENCY: Record<string, number> = {
  google: 3,
  meta: 2,
  default: 2,
};

function concurrencyGroup(type: string | null | undefined): string {
  if (type && GOOGLE_FAMILY.has(type)) return "google";
  if (type && META_FAMILY.has(type)) return "meta";
  // Fall back to the provider's OAuth backend id so distinct providers don't
  // share a budget; ultimately caps at the "default" limit below.
  return getIntegration(type)?.oauthProviderId ?? type ?? "default";
}

function limitFor(group: string): number {
  return GROUP_CONCURRENCY[group] ?? GROUP_CONCURRENCY.default;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Claims the N stalest syncable sources. NULLS FIRST means never-synced sources
// are picked up before anything else. Uses the admin client (the cron has no
// user session); every row still carries its agency_id, so downstream writes
// stay tenant-scoped and no data crosses agencies.
export async function claimSyncBatch(admin: SupabaseClient, limit: number): Promise<SyncableSource[]> {
  const { data, error } = await admin
    .from("data_sources")
    .select("id, agency_id, type, config, access_token, refresh_token, token_expires_at")
    .in("type", syncableTypes())
    .order("last_sync_attempt_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as SyncableSource[];
}

// Runs `worker` over `items` with at most `limit` in flight, adding a small
// random pre-delay (jitter) so a burst of same-provider calls doesn't hit the
// API in a synchronized spike.
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await sleep(Math.floor(Math.random() * 250)); // jitter
      await worker(item);
    }
  });
  await Promise.all(runners);
}

export type BatchResult = { claimed: number; synced: number; failed: number };

// Processes one bounded batch: claim → group by provider → run each group's pool
// in parallel (different providers don't share quota). syncDataSource never
// throws, so a single bad source can't abort the batch.
export async function runSyncBatch(admin: SupabaseClient, limit = batchSize()): Promise<BatchResult> {
  const sources = await claimSyncBatch(admin, limit);

  const groups = new Map<string, SyncableSource[]>();
  for (const ds of sources) {
    const key = concurrencyGroup(ds.type);
    const list = groups.get(key);
    if (list) list.push(ds);
    else groups.set(key, [ds]);
  }

  let synced = 0;
  let failed = 0;

  await Promise.all(
    Array.from(groups, ([group, list]) =>
      runPool(list, limitFor(group), async (ds) => {
        const result = await syncDataSource(admin, ds);
        if (result.ok) synced++;
        else failed++;
      })
    )
  );

  return { claimed: sources.length, synced, failed };
}
