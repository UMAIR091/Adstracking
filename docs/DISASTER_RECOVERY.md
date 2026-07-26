# ReportFlow — Backup & Disaster Recovery Runbook

Operational procedures for data protection and recovery. Owner: founder/eng lead.
Review quarterly and after any incident.

## 1. What we must protect

| Asset | Store | Loss impact |
|-------|-------|-------------|
| Tenant database (agencies, clients, reports, subscriptions, tokens) | Supabase Postgres | **Critical** — the product |
| Encrypted OAuth tokens | `data_sources` (AES-256-GCM, app-layer) | High — reconnect needed |
| Report PDFs (cache) | Supabase Storage `report-pdfs` | Low — re-rendered on demand |
| Logos | Supabase Storage `logos` | Low — re-uploadable |
| Secrets (keys, DSNs) | Vercel + Supabase env | Critical — see §6 |

## 2. Backup strategy (Supabase)

- **Point-in-Time Recovery (PITR)** is the primary mechanism. It must be **enabled on the Supabase project** (Pro plan or higher — Settings → Database → Backups).
  - Target: **PITR retention ≥ 7 days**.
  - **RPO (max data loss): ≤ 5 minutes** (PITR granularity).
  - **RTO (time to restore): ≤ 1 hour** (target).
- Daily automated logical backups are also retained by Supabase on paid plans.
- **Migrations** are version-controlled in `supabase/migrations/` — schema is reproducible from git.

> ⚠️ Launch gate: confirm PITR is ON and note the retention window. If the project is on the Free plan, PITR is unavailable — upgrade before taking paying customers.

## 3. Backup health verification (do this before launch, then monthly)

1. Supabase Dashboard → Database → Backups → confirm PITR shows a recent restore point (within minutes).
2. Confirm the earliest restore point ≥ retention target.
3. Run a **restore drill** (§4) at least once and record the result below.

`GET /api/health` verifies live DB connectivity (used by uptime monitoring) but does **not** verify backups — backups are verified via the Supabase dashboard + the periodic drill.

## 4. Restore procedure (drill + real incident)

**A. Point-in-time restore (data corruption / bad deploy / accidental deletion):**
1. Supabase Dashboard → Database → Backups → **Restore** → choose the timestamp just before the incident.
2. Supabase provisions a restored database. Note: this can replace the current DB — for a drill, restore into a **new project** instead to avoid disruption.
3. After restore, verify: row counts on `agencies`, `clients`, `reports`, `subscriptions`; run `GET /api/health`.
4. If connection string changed, update `SUPABASE_*` env in Vercel and redeploy.

**B. Schema-only rebuild (last resort):**
1. Create a fresh Supabase project.
2. Apply `supabase/migrations/*.sql` in order (or restore data backup).
3. Update Vercel env → redeploy.

**Restore drill log** (update each drill):

| Date | Type | Restore point | RTO achieved | Verified by | Notes |
|------|------|---------------|--------------|-------------|-------|
| _TODO before launch_ | | | | | |

## 5. Token & encryption recovery

- OAuth tokens are encrypted with `TOKEN_ENCRYPTION_KEY` (key-versioned — see `src/lib/crypto.ts`). **A DB restore is useless without this key.** Store it in a password manager AND in Vercel env; never rotate without preserving the old key (`TOKEN_ENCRYPTION_KEY_V<n>`).
- If the key is lost: tokens can't be decrypted → all agencies must reconnect their sources (data is safe, connections rebuild).

## 6. Secrets inventory (recovery depends on these)

Keep a copy of these in a password manager (values, not just names):
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `TOKEN_ENCRYPTION_KEY` (+ any `_V<n>`), `CRON_SECRET`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, and each integration's OAuth client id/secret.

## 7. Cadence

- **Before launch:** enable PITR, run one restore drill, fill the log, store secrets.
- **Monthly:** verify backup health.
- **Quarterly:** full restore drill into a scratch project.
- **After any incident:** post-mortem in `docs/INCIDENTS.md` (create as needed).
