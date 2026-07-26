// Read-only Paddle configuration check. Creates and modifies nothing.
//
// Deliberately holds NO price table of its own: amounts live in Paddle and the
// app reads them from there, so duplicating them here would recreate the drift
// this script exists to catch. Instead it verifies that the configuration is
// internally coherent:
//
//   * the API key authenticates against the right environment
//   * every configured price id exists, is active, and has a billing cycle
//   * monthly and quarterly prices for a plan share a currency, and quarterly
//     is a genuine discount on 3x monthly
//   * plans are priced in ascending order of client capacity
//   * trial prices (if configured) mirror their standard counterpart exactly
//     and actually carry a trial period
//
// Usage: node scripts/verify-paddle.mjs .env
import { readFileSync } from "node:fs";

const envPath = process.argv[2] ?? ".env";
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
if (!key) { console.error(`No PADDLE_API_KEY in ${envPath}`); process.exit(1); }

const keyIsSandbox = key.startsWith("pdl_sdbx");
const declared = (env.PADDLE_ENV ?? "").trim().toLowerCase();
const declaredProd = declared === "production" || declared === "live";
const base = keyIsSandbox ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";

// Must match PAID_TRIAL_DAYS in src/lib/billing/config.ts.
const TRIAL_DAYS = 3;
// Plan order must match CATALOG in src/lib/billing/config.ts (ascending capacity).
const PLANS = [["Pro", "PRO"], ["Pro Plus", "PRO_PLUS"], ["Growth", "GROWTH"], ["Agency", "AGENCY"]];

let failures = 0;
const fail = (msg) => { console.log(`  ! ${msg}`); failures++; };
// Something the app already handles gracefully — reported, but not a failure.
const warn = (msg) => console.log(`  ~ ${msg}`);

console.log(`Key environment : ${keyIsSandbox ? "SANDBOX" : "LIVE"}  (${base})`);
console.log(`PADDLE_ENV      : ${env.PADDLE_ENV || "(unset — defaults to sandbox)"}`);
console.log(`Webhook secret  : ${env.PADDLE_WEBHOOK_SECRET ? "set" : "MISSING"}`);
console.log(`Client token    : ${env.PADDLE_CLIENT_TOKEN ? "set" : "MISSING"}\n`);

if (!env.PADDLE_WEBHOOK_SECRET) fail("PADDLE_WEBHOOK_SECRET is missing — the webhook will reject every event.");
if (!env.PADDLE_CLIENT_TOKEN) fail("PADDLE_CLIENT_TOKEN is missing — checkout cannot open.");
// A live key with sandbox settings (or vice versa) bills real cards by accident.
if (keyIsSandbox && declaredProd) fail("PADDLE_ENV says production but the API key is a sandbox key.");
if (!keyIsSandbox && !declaredProd) fail("The API key is LIVE but PADDLE_ENV is not production — the app will call the sandbox.");

async function getPrice(id) {
  const res = await fetch(`${base}/prices/${encodeURIComponent(id)}?include=product`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, detail: body?.error?.detail ?? body?.error?.code ?? `HTTP ${res.status}` };
  return { ok: true, price: body.data };
}

// Mirrors the app's env resolution (src/lib/billing/config.ts): the recurring
// interval is QUARTERLY, but this deployment's variables are still named
// *_YEARLY_* because they were repointed at 3-month prices rather than renamed.
// A *_QUARTERLY_* variable wins when both are present.
const SUFFIXES = { monthly: ["MONTHLY"], quarterly: ["QUARTERLY", "YEARLY", "ANNUAL"] };

const readId = (envKey, interval, trial) => {
  for (const suffix of SUFFIXES[interval]) {
    const id = trial
      ? env[`PADDLE_${envKey}_${suffix}_TRIAL_PRICE_ID`] ?? env[`PADDLE_PRICE_${envKey}_${suffix}_TRIAL`]
      : env[`PADDLE_${envKey}_${suffix}_PRICE_ID`] ?? env[`PADDLE_PRICE_${envKey}_${suffix}`];
    if (id) return id;
  }
  return undefined;
};

const money = (p) => Number(p.unit_price?.amount ?? NaN);
const cur = (p) => p.unit_price?.currency_code ?? "?";

console.log("Standard prices");
const resolved = [];
let trialCount = 0;

for (const [label, envKey] of PLANS) {
  const row = { label, envKey, monthly: null, quarterly: null };

  for (const [interval, wantFreq, wantCycle] of [["monthly", 1, "month"], ["quarterly", 3, "month"]]) {
    const id = readId(envKey, interval, false);
    const tag = `  ${label} ${interval}`.padEnd(24);
    if (!id) { console.log(`${tag} not configured`); continue; }

    const r = await getPrice(id);
    if (!r.ok) { console.log(`${tag} ${id}`); fail(`${label} ${interval}: ${r.detail}`); continue; }

    const p = r.price;
    const amount = money(p);
    console.log(`${tag} ${id}  ${(amount / 100).toString().padStart(7)} ${cur(p)}/${p.billing_cycle?.interval ?? "one-time"}  ${p.product?.name ?? ""}`);

    if (p.status !== "active") fail(`${label} ${interval} is ${p.status}, not active.`);
    if (p.billing_cycle?.interval !== wantCycle || Number(p.billing_cycle?.frequency) !== wantFreq) {
      fail(`${label} ${interval} has cycle ${p.billing_cycle?.frequency} ${p.billing_cycle?.interval}, expected ${wantFreq} ${wantCycle}.`);
    }
    row[interval] = { id, amount, currency: cur(p), product: p.product_id, price: p };
  }

  // Quarterly must actually be a discount, and in the same currency.
  if (row.monthly && row.quarterly) {
    if (row.monthly.currency !== row.quarterly.currency) {
      fail(`${label}: monthly is ${row.monthly.currency} but quarterly is ${row.quarterly.currency}.`);
    }
    const three = row.monthly.amount * 3;
    if (row.quarterly.amount > three) {
      fail(`${label}: quarterly (${row.quarterly.amount / 100}) costs more than 3x monthly (${three / 100}).`);
    } else {
      const pct = Math.round((1 - row.quarterly.amount / three) * 100);
      console.log(`  ${label.padEnd(10)} quarterly saving: ${pct}%`);
    }
  }
  resolved.push(row);
}

// Capacity and price must increase together, or the upgrade/downgrade logic
// (which ranks by catalog order) would disagree with what customers pay.
for (let i = 1; i < resolved.length; i++) {
  const prev = resolved[i - 1], curr = resolved[i];
  if (prev.monthly && curr.monthly && curr.monthly.amount <= prev.monthly.amount) {
    fail(`${curr.label} (${curr.monthly.amount / 100}) is not priced above ${prev.label} (${prev.monthly.amount / 100}) — plan order and price disagree.`);
  }
}

console.log("\nTrial prices");
for (const row of resolved) {
  for (const interval of ["monthly", "quarterly"]) {
    const id = readId(row.envKey, interval, true);
    if (!id) continue;
    trialCount++;

    const tag = `  ${row.label} ${interval}`.padEnd(24);
    const r = await getPrice(id);
    if (!r.ok) { console.log(`${tag} ${id}`); fail(`${row.label} ${interval} trial: ${r.detail}`); continue; }

    const p = r.price;
    const t = p.trial_period;
    const standard = row[interval];
    console.log(`${tag} ${id}  ${(money(p) / 100).toString().padStart(7)} ${cur(p)}  trial=${t ? `${t.frequency} ${t.interval}` : "NONE"}`);

    // An inactive trial price is not an error: checkout verifies the price is
    // active before using it and falls back to the standard price, so the sale
    // still completes. The remaining checks would only describe a price the
    // app will never charge, so they are skipped.
    if (p.status !== "active") {
      warn(`${row.label} ${interval} trial price is ${p.status} — checkout will use the standard price instead.`);
      if (standard?.price?.trial_period) {
        warn(`${row.label} ${interval} standard price carries its own ${standard.price.trial_period.frequency} ${standard.price.trial_period.interval} trial, so the trial is still offered.`);
      }
      continue;
    }

    if (!t) fail(`${row.label} ${interval} trial price has no trial_period — it would charge immediately.`);
    else if (t.interval !== "day" || Number(t.frequency) !== TRIAL_DAYS) {
      fail(`${row.label} ${interval} trial is ${t.frequency} ${t.interval}, expected ${TRIAL_DAYS} day.`);
    }
    // A trial price that charges a different amount than its standard twin
    // would silently change the price after the trial ends.
    if (standard) {
      if (money(p) !== standard.amount) fail(`${row.label} ${interval} trial price is ${money(p) / 100}, standard is ${standard.amount / 100} — they must match.`);
      if (cur(p) !== standard.currency) fail(`${row.label} ${interval} trial currency differs from standard.`);
      if (p.billing_cycle?.interval !== standard.price.billing_cycle?.interval) fail(`${row.label} ${interval} trial cycle differs from standard.`);
    }
  }
}

if (trialCount === 0) {
  console.log("  none configured — paid plans charge immediately and no trial is advertised.");
  console.log("  To enable: node scripts/create-trial-prices.mjs .env --apply");
} else if (trialCount < 8) {
  console.log(`  ${trialCount} of 8 configured — plans without a trial price simply charge immediately.`);
}

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} problem(s) found.`}`);
process.exit(failures === 0 ? 0 : 1);
