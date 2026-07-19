import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/LegalShell";
import { COMPANY, LEGAL_LAST_UPDATED } from "@/lib/company";

export const metadata: Metadata = {
  title: `Refund & Cancellation Policy — ${COMPANY.product}`,
  description: `How subscriptions, cancellations, and refunds work for ${COMPANY.product}.`,
};

export default function RefundPage() {
  return (
    <LegalShell
      title="Refund & Cancellation Policy"
      subtitle={`How subscriptions, cancellations, and refunds work for ${COMPANY.product}.`}
      lastUpdated={LEGAL_LAST_UPDATED}
    >
      <p>
        This policy explains how billing, cancellations, and refunds work for {COMPANY.product}, operated by{" "}
        {COMPANY.legalName}. It forms part of our <Link href="/terms">Terms of Service</Link>.
      </p>

      <h2>1. Free trial</h2>
      <p>
        New accounts start with a 7-day free trial with full access and no payment card required. You will not be
        charged unless you choose to subscribe. If you do not subscribe, your trial simply ends and no payment is taken.
      </p>

      <h2>2. Subscriptions & billing</h2>
      <p>
        {COMPANY.product} is a subscription billed in advance on a recurring basis — monthly, or annually if you choose
        annual billing. Prices are shown in US dollars (USD). Payments, invoicing, and any applicable sales tax or VAT
        are processed by our third-party payment provider, which acts as the merchant of record. Your subscription
        renews automatically at the end of each billing period until you cancel.
      </p>

      <h2>3. Cancellation</h2>
      <p>
        You can cancel at any time from your billing settings, or by emailing us at{" "}
        <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>. When you cancel:
      </p>
      <ul>
        <li>You will not be charged for any future billing period.</li>
        <li>Your subscription remains active until the end of the period you have already paid for.</li>
        <li>Cancellation stops future renewals; it does not, by itself, trigger a refund of the current period.</li>
      </ul>

      <h2>4. Refunds</h2>
      <p>
        We want you to be happy with {COMPANY.product}. If something isn&apos;t right, contact us at{" "}
        <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a> and we&apos;ll do our best to make it right.
      </p>
      <ul>
        <li>
          <strong>14-day money-back guarantee.</strong> If you are not satisfied, request a refund within 14 days of your
          first payment and we will refund that payment in full.
        </li>
        <li>
          <strong>Annual plans.</strong> Annual subscriptions are also covered by the 14-day money-back guarantee from
          the date of the first annual charge. After 14 days, annual plans are non-refundable for the remainder of the
          term, but you may cancel to prevent the next renewal.
        </li>
        <li>
          <strong>Renewals.</strong> Recurring renewal charges are generally non-refundable. If you were charged for a
          renewal you intended to cancel, contact us within 7 days of the charge and we will review it in good faith.
        </li>
        <li>
          <strong>Duplicate or erroneous charges</strong> are always refunded in full.
        </li>
      </ul>

      <h2>5. How refunds are issued</h2>
      <p>
        Approved refunds are returned to the original payment method via our payment provider. Depending on your bank or
        card issuer, it can take 5–10 business days for the funds to appear.
      </p>

      <h2>6. Contact</h2>
      <p>
        Questions about billing, cancellation, or refunds? Email{" "}
        <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a> and we&apos;ll respond promptly. See also our{" "}
        <Link href="/pricing">Pricing</Link> and <Link href="/terms">Terms of Service</Link>.
      </p>
    </LegalShell>
  );
}
