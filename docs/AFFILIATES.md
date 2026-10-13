# Affiliate / referral tracking

A lightweight, in-house affiliate system. Each creator or partner gets a link like
`https://tryreportflow.com/?ref=creatorname`. When someone arrives through it, signs
up and later pays, Anavyst records which affiliate referred them and the commission
owed. Commissions are paid **by hand** outside the app, then marked paid on the
owner-only admin page at `/dashboard/admin/affiliates`.

Not included on purpose: click counting, automated payouts, a creator login, and any
Paddle configuration (discount codes, prices).

## How a link works

1. **Landing.** A visitor opens any page with `?ref=<code>`. Middleware
   (`src/lib/affiliates/capture.ts`) lowercases and validates the code, then sets a
   first-party cookie `anavyst_ref`. The cookie is HttpOnly, SameSite=Lax, Secure in
   production, and lasts `AFFILIATE_COOKIE_DAYS` (60 by default). It holds the code and
   the landing path.
   - **First touch wins:** an existing valid cookie is never overwritten.
   - **Malformed codes** are ignored silently. Middleware never queries the database.
   - **Consent:** the cookie is set only where the Meta Pixel may run. That means no
     cookie for the EEA, the UK or Switzerland, none under Global Privacy Control, none
     when the country is unknown, and only on the pixel's pages (marketing, `/signup`,
     `/dashboard/billing`).
2. **Signup.** The agency row is created on a new user's first signed-in request
   (`getCurrentUserAndAgency` in `src/lib/agency.ts`), for both email and Google signup.
   At that moment `attachReferral` (`src/lib/affiliates/attach.ts`) resolves the code
   and writes one `referrals` row using the service role. It does nothing when:
   - there is no cookie;
   - the code is unknown or the affiliate is paused;
   - the user's email equals the affiliate's (self-referral);
   - the agency already has a referral.

   It never blocks signup. The cookie is then expired on that first signed-in dashboard
   response. A signup on a different device has no cookie and gets no attribution.
3. **Payment.** The Paddle webhook (`transaction.completed`) calls `recordCommission`
   (`src/lib/affiliates/commissions.ts`) after its billing work has succeeded.

## Data model (migration `0043_affiliates.sql`)

All three tables follow the same lockdown as `ad_attribution`: service role only, RLS
on with no policies, and `revoke all` from `anon` and `authenticated`. Money is stored
as integers in minor units.

| Table | What it holds |
|---|---|
| `affiliates` | `code` (the `?ref` value, unique, `^[a-z0-9][a-z0-9_-]{1,31}$`), name, email, status (`active`/`paused`), `commission_pct` (0–100, no default), `commission_type` (`first_payment`/`recurring`), `recurring_months` (null = no limit), `discount_code` (reference only), payout method and details (sensitive; shown only on the admin page). |
| `referrals` | One row per referred agency, first touch wins. Also records `first_paid_at` / `first_transaction_id`, the agency's first payment above zero, which anchors the commission rules. |
| `affiliate_commissions` | One row per Paddle transaction (`paddle_transaction_id` is unique, so replays never duplicate). Holds the net amount, the rate snapshotted at creation, the commission, status, `payable_after`, payout fields, refund tracking (`refunded_net_minor`, `applied_adjustment_ids`) and `clawback_needed`. |

## Commission rules

- **Net amount:** the pre-tax amount charged after discounts, which is Paddle
  `details.totals.subtotal − details.totals.discount`. Tax is never included.
  Zero-amount transactions (trial starts) are skipped.
- **Commission:** `round(net × rate / 100)`, rounding half up, in exact integer
  arithmetic.
- **`first_payment`:** pays only on the agency's first payment above zero.
- **`recurring`:** pays on each payment within `recurring_months` of that first payment,
  measured as calendar months from the first payment's timestamp. Without a limit it
  pays for the life of the subscription.
- **Rate changes:** the rate is copied onto each commission when it is created, so
  changing an affiliate's rate later never rewrites history.
- **Pausing:** a paused affiliate gets no **new** referrals. Agencies they already
  referred keep earning under the agreed terms. Pausing never deletes anything.
- **Statuses:**
  - `pending` reads as `payable` once `payable_after` has passed. That is
    `AFFILIATE_HOLD_DAYS` after creation, 30 days by default, which covers the 14-day
    money-back window plus approval time.
  - `paid` is set only by hand, on the admin page.

## Refunds and chargebacks

The webhook also handles `adjustment.created` and `adjustment.updated`. An adjustment
counts only when it is an **approved** `refund` or `chargeback`. Each adjustment id is
applied once, so a created/updated pair or a replay never double-counts.

- **Full refund:** the commission becomes `reversed`, with `reversed_at` set. The amount
  stays on the row so the "reversed" total shows what was lost.
- **Partial refund:** the commission is recomputed on the net amount still kept, so it
  drops proportionally. Several partial refunds accumulate, and they reverse the
  commission once they reach the full amount.
- **Refund after payout:** the paid amount is left as recorded. `clawback_needed` is set,
  the note says how much to recover, and the admin page highlights the row.
- **Not acted on:**
  - credits to the account balance (no money left Paddle);
  - pending or rejected refunds;
  - chargeback reversals, which are rare and need a judgement call — fix those by hand.

## Paying out by hand (monthly)

1. Open `/dashboard/admin/affiliates` and choose the affiliate.
2. Optionally download the CSV of payable commissions for the month. Payout details are
   left out of the file on purpose; they are shown on the page.
3. Pay the affiliate outside the app (Payoneer, PayPal, Wise, …).
4. Tick the payable rows, enter the payout reference, and click **Mark paid**. Only
   commissions past their hold that are not already paid or reversed can change.
5. Rows flagged **Refunded after payout** need that amount recovered or netted off the
   next payout.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `ADMIN_EMAILS` | *(empty = nobody)* | Comma-separated emails allowed into `/dashboard/admin/*` (case-insensitive). Everyone else gets a 404. |
| `AFFILIATE_COOKIE_DAYS` | 60 | Lifetime of the `anavyst_ref` cookie. |
| `AFFILIATE_HOLD_DAYS` | 30 | Days before a commission becomes payable. |

The referral link uses `NEXT_PUBLIC_APP_URL`.

## Setup checklist

- [ ] Apply `supabase/migrations/0043_affiliates.sql` in the Supabase SQL editor.
- [ ] Set `ADMIN_EMAILS` in Vercel (Production), then redeploy.
- [ ] In Paddle → Developer tools → Notifications, add **`adjustment.created`** and
      **`adjustment.updated`** to the webhook destination. Without them, refunds never
      reach the app.
- [ ] (Paddle, optional) Create a discount code per creator and record it in the
      affiliate's **Paddle discount code** field. The app does not read it; it is for
      your reference. The discount reduces the net amount, so the commission follows
      it automatically.
