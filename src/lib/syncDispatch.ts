// Horizontally-scalable sync dispatch (perf audit P0).
//
// The old model processed one bounded batch inside a single 60s function, so
// total throughput was capped at "batch size per cron tick." That cannot keep
// hundreds of thousands of sources fresh.
//
// The dispatcher instead:
//   1. ATOMICALLY claims a large batch (claim_sync_batch → FOR UPDATE SKIP
//      LOCKED, stamps last_sync_attempt_at) — no duplicate processing, fair
//      rotation, no starvation (stalest first).
//   2. Splits it into chunks and FANS OUT each chunk to its own worker
//      invocation, which run in PARALLEL. Throughput now scales with the number
//      of chunks (worker invocations), not a single function's wall-clock.
//   3. Awaits the workers and aggregates results.
//
// Fully serverless (self-invoked HTTP workers on the same deployment; no new
// infrastructure). QUEUE-READY: the only coupling to the transport is
// `enqueueChunk()`. Swapping to a managed queue (e.g. Upstash QStash) later is a
// change to that one function — the claim/worker/processing code is untouched.
import type { SupabaseClient } from "@supabase/supabase-js";
import { claimSyncBatch } from "@/lib/syncBatch";

export type DispatchResult = { claimed: number; chunks: number; synced: number; failed: number };

export function dispatchConfig(): { total: number; chunkSize: number } {
  const total = Number(process.env.SYNC_DISPATCH_LIMIT) || Number(process.env.SYNC_BATCH_SIZE) || 200;
  const chunkSize = Number(process.env.SYNC_CHUNK_SIZE) || 25;
  return { total: Math.max(1, Math.floor(total)), chunkSize: Math.max(1, Math.floor(chunkSize)) };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// The transport seam. Today: an authenticated HTTP call to the worker route,
// which Vercel runs as a separate (parallel) function invocation. Tomorrow: push
// to a managed queue here instead — nothing else changes.
async function enqueueChunk(baseUrl: string, secret: string, ids: string[]): Promise<{ synced: number; failed: number }> {
  try {
    const res = await fetch(`${baseUrl}/api/cron/sync-worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ ids }),
      // The worker has its own maxDuration; don't hang the dispatcher forever.
      signal: AbortSignal.timeout(70_000),
    });
    if (!res.ok) return { synced: 0, failed: ids.length };
    const body = (await res.json().catch(() => null)) as { synced?: number; failed?: number } | null;
    return { synced: body?.synced ?? 0, failed: body?.failed ?? 0 };
  } catch {
    // A failed dispatch just means these sources weren't synced this run — they
    // were already claimed (attempt stamped) so they rotate to the back and are
    // retried next tick. No starvation, no duplication.
    return { synced: 0, failed: ids.length };
  }
}

export async function dispatchSyncBatch(admin: SupabaseClient, baseUrl: string, secret: string): Promise<DispatchResult> {
  const { total, chunkSize } = dispatchConfig();
  const claimed = await claimSyncBatch(admin, total);
  if (claimed.length === 0) return { claimed: 0, chunks: 0, synced: 0, failed: 0 };

  const chunks = chunk(claimed.map((s) => s.id), chunkSize);
  const results = await Promise.all(chunks.map((ids) => enqueueChunk(baseUrl, secret, ids)));

  const synced = results.reduce((n, r) => n + r.synced, 0);
  const failed = results.reduce((n, r) => n + r.failed, 0);
  return { claimed: claimed.length, chunks: chunks.length, synced, failed };
}
