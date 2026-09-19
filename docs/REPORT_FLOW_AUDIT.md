# Report flow audit — 2026-09-19

End-to-end review of the report flow: **generate → store → preview → PDF → email
send**, plus the scheduled-delivery engine.

Baseline at time of audit: `2a7296f`, typecheck clean, 544/544 tests passing.
No code was changed for this audit — findings only.

**How to read this.** Each finding names the evidence in the code. "Verified"
means I traced it in the source; "inferred" means the conclusion rests on a
number the repo itself states rather than on a runtime measurement. Nothing here
was reproduced against production.

---

## S1 — Critical · Scheduled delivery silently drops most due reports

**Files:** `vercel.json`, `src/lib/scheduledReports.ts`,
`supabase/migrations/0025_report_deliveries.sql`, `.env.example:293-295`

The batch bound and the retry design assume a cron that runs every few minutes.
It runs **once a day**.

| Fact | Where |
|---|---|
| Cron fires daily at 08:00 UTC | `vercel.json` — `{ "path": "/api/cron/reports", "schedule": "0 8 * * *" }` |
| Function wall clock is 60s | `src/app/api/cron/reports/route.ts:9` — `maxDuration = 60` |
| Up to 50 occurrences claimed per run | `.env.example:295` — `SCHEDULE_BATCH_SIZE="50"` |
| One job costs ~15s for AI alone | `src/app/api/reports/generate/route.ts:11-14` — *"AI insight generation runs inside createClientReport and takes ~15s"* |
| Jobs run strictly sequentially | `src/lib/scheduledReports.ts:215-219` — `for (const job of jobs) { … await processJob(…) }` |

So one run completes roughly **3 jobs**, not 50. Each job is
`createClientReport` (AI ~15s) + PDF render + Resend send. AI is not skippable
on this path: scheduled delivery requires a paid plan
(`scheduledReports.ts:208`), and every paid plan has `aiInsights: true`
(`billing/config.ts:112`). The insight cache is keyed on the exact model input,
so a new reporting period is always a live call.

What happens to the other ~47:

1. **Their schedule has already moved on.** `next_run_at` is advanced for *all*
   freshly-claimed jobs up front, before any send —
   `scheduledReports.ts:196`, `await Promise.all(freshJobs.map((job) => advanceSchedule(…)))`.
   That occurrence will never fire from the schedule again.
2. **Their ledger rows stay `status='claimed'`.** The function is killed at 60s,
   so `finalize()` never runs for them.
3. **The retry path is starved, not merely slow.** `claim_stuck_deliveries`
   requires `created_at > now() - interval '24 hours'`
   (`0025_report_deliveries.sql:150`), and the only thing that calls it is the
   next cron run — 24 hours later. Rows are therefore eligible for a window of
   seconds at the very start of the next run. Worse, stuck jobs are appended
   **after** fresh ones (`scheduledReports.ts:185`,
   `const jobs = [...freshJobs, ...stuckJobs]`), so in a run that can only
   finish ~3 jobs the retries are never reached at all.

**Failure scenario.** An agency has 20 clients on monthly schedules, all due on
the 1st at 08:00. Three clients get their report. Seventeen do not. Every
schedule's `next_run_at` has advanced to next month, so nothing re-fires.

**And nothing surfaces it.** The run returns `{ ok: true, sent: 3, failed: 0 }`
and the heartbeat detail reads `sent 3 failed 0`
(`api/cron/reports/route.ts:44`). `/api/health` shows the job green. The 17
undelivered reports are not counted as `failed` or `skipped` — they were never
reached, so no counter moves.

This contradicts the module's own header contract:
*"BOUNDED per run (SCHEDULE_BATCH_SIZE) so a run never risks the 60s wall"* and
*"NO SKIPS"* (`scheduledReports.ts:8`, `:16`).

**Test coverage:** none. `scheduledReports.test.ts` covers plan gating and
archived clients; no test asserts throughput, the 60s wall, or that a
claimed-but-unreached occurrence survives.

*Status: verified in source. The ~15s figure is the repo's own; per-job wall
time was not measured at runtime, so "~3 jobs" is inferred from it.*

---

## S2 — High · `regenerate-insights` is missing every guard its siblings have

**File:** `src/app/api/reports/[id]/regenerate-insights/route.ts`

Four independent gaps in one route. (a) is a direct continuation of launch audit
**B3** — that fix set `maxDuration = 60` on generate, send, pdf and cron, and
this route was missed.

| | Gap | Evidence |
|---|---|---|
| a | **No `maxDuration`** → Vercel's 10s default, but the AI call takes ~15s. The route is killed before it stores anything, so "Regenerate insights" cannot succeed in production. | Only route in the flow without it: generate/send/pdf/cron all set 60 |
| b | **No plan gate** → a Free-plan agency can POST here and get paid AI insights. `featuresForPlan(plan).aiInsights` is checked in exactly one place, and it isn't this one. | `grep aiInsights` → `billing/config.ts` + `reportGen.ts:336` only |
| c | **No usage metering** → AI spend on this path is invisible. | `trackUsage(…, "ai_summaries")` appears only at `reportGen.ts:345` |
| d | **No `rateLimit`, no `requireActiveAccess`** → unbounded model calls per workspace, and a lapsed subscription can still spend tokens. | generate and send have both; this route has neither |

**Failure scenario for (b):** a Free-plan agency generates a report (correctly
gets no insights, model never called), then POSTs
`/api/reports/<id>/regenerate-insights`. It returns `{ ok: true }` and the paid
AI analysis is written into the report — unmetered, unthrottled, and billable to
you.

*Status: verified in source.*

---

## S3 — Medium · `processJob` can throw and abort the rest of the batch

**File:** `src/lib/scheduledReports.ts`

Line 84 documents *"Never throws."* It can. The `try` at line 93 wraps only
`createClientReport`. Unguarded: every `finalize()` call (lines 88, 124, 136,
164, 167), the `clients`/`agencies` reads (128-131), and `deliverReport` itself.

One transient DB error on a `report_deliveries` update propagates out of
`processJob` → out of the `for` loop (line 217) → out of `runScheduledReports`
→ the cron returns 500. Every remaining job in the batch is abandoned, and their
schedules have already had `next_run_at` advanced. Compounds S1.

*Status: verified by inspection of the try/catch boundaries. `deliverReport`
documents "Never throws" and returns a result, so the realistic trigger is a
`finalize()` or client/agency read failure.*

---

## S4 — Medium · Regenerating insights re-introduces the period bug that was fixed at generation

**File:** `src/app/api/reports/[id]/regenerate-insights/route.ts:43-44`

```ts
const days = data.gsc?.byDate?.length || data.ga4?.byDate?.length || 0;
const periodLabel = days ? `the last ${days} days` : "this reporting period";
```

Generation deliberately does the opposite — `reportGen.ts:338-341` passes the
real window, with the comment: *"The AI is told the real window, not a generic
'last N days' phrase, so its prose can't describe a period the report doesn't
cover."*

The stored report already carries `meta.periodLabel`, `meta.requested.start/end`
and `meta.periodDays`. This route ignores all of them and rebuilds a label from
row counts, so:

- A **Q2 2026** report regenerates with the model told *"the last 61 days"* —
  the prose can then describe a window the report doesn't cover.
- A **Meta-Ads-only** report has no `gsc`/`ga4` `byDate` at all, so `days` is 0
  and the model is told *"this reporting period"* with no window whatsoever.
  (`blocks` are not consulted.)

*Status: verified in source.*

---

## S5 — Low/Medium · The agency's own PDF download bypasses the render cache

**File:** `src/app/api/reports/[id]/pdf/route.ts:27`

It calls `renderReportPdf` directly. Both other PDF paths use the Storage-backed
cache: `r/[token]/pdf/route.ts:33` and `delivery.ts:97` use
`getOrRenderReportPdf`. So the authenticated "Download PDF" re-renders the whole
document on every click, while the public share link — the one that was hardened
for cost-DoS (audit #3) — serves a cached copy.

It is also the only route in the flow with neither `rateLimit` nor
`requireActiveAccess`. **Open question rather than a defect:** withholding
`requireActiveAccess` here may be deliberate, so a lapsed agency can still
retrieve reports it already paid to generate. Worth confirming intent before
changing.

*Status: verified in source.*

---

## S6 — Low · A throwing AI step can burn a trial report allowance

**Files:** `src/lib/ai/index.ts`, `src/lib/reportGen.ts:320-346`

`generateReportInsightsCached` calls `createAdminClient()` **outside** its
`try`. `createAdminClient` is `createClient(url!, key!)`
(`supabase/admin.ts:6`), and supabase-js throws when either argument is falsy —
so a missing `SUPABASE_SERVICE_ROLE_KEY` makes the AI step throw rather than
return `null`.

That propagates out of `createClientReport` *after* `reserveReportGeneration`
(line 320) and *before* the insert (line 356), so `releaseReportGeneration` —
which only runs on insert failure (line 376) — never fires. The generation stays
counted with no report stored.

Blast radius is narrow: `releaseReportGeneration` no-ops when `periodMonth` is
null, which is the paid-plan case, so only **trial/free** agencies (the ones with
a real limit) lose a generation. It also violates the module's stated contract,
*"Never fail report generation because of the AI step"* (`ai/index.ts`).

*Status: verified in source. Trigger requires a misconfigured environment, which
is why this is Low.*

---

## S7 — Low · Duplicated work on two hot paths

- **`assembleReport` runs twice per generation** — `reportGen.ts:332` builds
  `unified` for the AI input, then `:346` rebuilds the whole thing with insights.
  Full composition done twice for one report.
- **The public report page loads the report twice** — once in `generateMetadata`
  and once in the page body (`r/[token]/page.tsx:18`, `:34`), each a
  report + agency + client round-trip. *Unverified:* whether Next dedupes these
  depends on the cache mode supabase-js sets; worth measuring before treating it
  as real.

---

## Suggested order

1. **S1** — the core paid promise is silently failing at any real scale. Needs a
   decision as well as a patch: raise cron frequency, cut the batch to what 60s
   actually fits, process fresh jobs with a time budget, and put stuck retries
   *before* fresh claims so the backlog can drain.
2. **S2** — finishes launch audit B3 and closes a paid-feature bypass. Smallest
   diff of anything here; (a) is one line.
3. **S3** — cheap hardening that makes S1's fix trustworthy.
4. **S4** — pass the stored `meta` window through instead of recomputing a label.
5. **S5/S6/S7** — opportunistic.

## What this audit did not cover

Report *content* correctness (`lib/reports/derive.ts`, `summary.ts`, `verdict.ts`,
`soWhat.ts`, `composition.ts` — ~1,900 lines with their own test suites), the
preview and browser components, and email rendering/deliverability. Those are a
separate pass.
