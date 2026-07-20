// Creates the trial-enabled Paddle prices that back the one-time paid-plan
// trial.
//
// WHY THIS EXISTS
// Paddle attaches a trial to the *price*, not to the checkout, so there is no
// way to grant a trial to one customer and charge another on the same price.
// The app therefore keeps two prices per plan/interval: the standard one, and
// an identical one carrying a trial period. Checkout picks between them based
// on whether the customer has ever had a trial (see src/lib/billing/trial.ts).
//
// This script clones each configured standard price, adding the trial. It is
// idempotent: prices it already created are detected by their custom_data
// marker and skipped, so re-running never produces duplicates.
//
// Usage:
//   node scripts/create-trial-prices.mjs .env            # dry run, shows plan
//   node scripts/create-trial-prices.mjs .env --apply    # actually create
import { readFileSync } from "node:fs";

const envPath = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!envPath) {
  console.error("Usage: node scripts/create-trial-prices.mjs <path-to-.env> [--apply]");
  process.exit(1);
}

const raw = readFileSync(envPath, "utf8");
const env = {};
for (const line of raw.split(/\r?\n/)) {
  if (/^\s*#/.test(line)) continue;
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (!m) continue;
  let v = (m[2] ?? "").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[m[1]] = v;
}

const key = env.PADDLE_API_KEY;
if (!key) { console.error("No PADDLE_API_KEY in " + envPath); process.exit(1); }

const sandbox = key.startsWith("pdl_sdbx");
const base = sandbox ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";

// Must match PAID_TRIAL_DAYS in src/lib/billing/config.ts.
const TRIAL_DAYS = 3;
// Marks prices created by this script so re-runs can find and skip them.
const MARKER = "reportflow_trial_clone";

const PLANS = [
  ["Pro", "PRO"],
  ["Pro Plus", "PRO_PLUS"],
  ["Growth", "GROWTH"],
  ["Agency", "AGENCY"],
];

async function api(path, init) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body?.error?.detail ?? body?.error?.code ?? `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return body;
}

console.log(`Environment: ${sandbox ? "SANDBOX" : "LIVE"}  (${base})`);
console.log(`Trial length: ${TRIAL_DAYS} days`);
console.log(APPLY ? "Mode: APPLY — prices will be created\n" : "Mode: DRY RUN — nothing will be created (pass --apply)\n");

// Existing prices, so we can both read the source price and detect prior runs.
const existing = (await api("/prices?per_page=200&status=active")).data;
const byId = new Map(existing.map((p) => [p.id, p]));
const clonesBySource = new Map();
for (const p of existing) {
  const src = p.custom_data?.[MARKER];
  if (src) clonesBySource.set(src, p);
}

const results = [];
let created = 0;
let skipped = 0;

for (const [label, envKey] of PLANS) {
  for (const [interval, suffix] of [["monthly", "MONTHLY"], ["yearly", "YEARLY"]]) {
    const sourceId = env[`PADDLE_${envKey}_${suffix}_PRICE_ID`] ?? env[`PADDLE_PRICE_${envKey}_${suffix}`];
    const varName = `PADDLE_${envKey}_${suffix}_TRIAL_PRICE_ID`;
    const tag = `${label} ${interval}`.padEnd(20);

    if (!sourceId) { console.log(`${tag} no source price configured — skipped`); continue; }

    const source = byId.get(sourceId);
    if (!source) { console.log(`${tag} source ${sourceId} not found in catalog — skipped`); continue; }

    const already = clonesBySource.get(sourceId);
    if (already) {
      console.log(`${tag} already exists  ${already.id}`);
      results.push([varName, already.id]);
      skipped++;
      continue;
    }

    const payload = {
      product_id: source.product_id,
      description: `${source.description} (${TRIAL_DAYS}-day trial)`,
      unit_price: source.unit_price,
      billing_cycle: source.billing_cycle,
      trial_period: { interval: "day", frequency: TRIAL_DAYS },
      tax_mode: source.tax_mode,
      quantity: source.quantity,
      custom_data: { ...(source.custom_data ?? {}), [MARKER]: sourceId },
    };

    if (!APPLY) {
      console.log(`${tag} would create: ${payload.description} @ ${Number(source.unit_price.amount) / 100} ${source.unit_price.currency_code}/${source.billing_cycle.interval}`);
      continue;
    }

    try {
      const res = await api("/prices", { method: "POST", body: JSON.stringify(payload) });
      console.log(`${tag} created       ${res.data.id}`);
      results.push([varName, res.data.id]);
      created++;
    } catch (err) {
      console.log(`${tag} FAILED: ${err.message}`);
    }
  }
}

if (!APPLY) {
  console.log("\nDry run complete. Re-run with --apply to create these prices.");
  process.exit(0);
}

console.log(`\n${created} created, ${skipped} already existed.`);
if (results.length) {
  console.log("\nAdd these to .env and to your Vercel environment:\n");
  for (const [name, id] of results) console.log(`${name}="${id}"`);
  console.log("\nThen re-run: node scripts/verify-paddle.mjs .env");
}
