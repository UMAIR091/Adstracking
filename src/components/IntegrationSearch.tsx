"use client";

// Searchable grid of connectable integrations. Presentation only — it filters a
// list the server already built from the registry, and reuses DataSourceCard so
// the card design stays in one place.
import { useMemo, useState } from "react";
import { Search as SearchIcon, X } from "lucide-react";
import { DataSourceCard, type DataSourceCardData } from "@/components/DataSourceCard";

// Extra search terms per integration, so the obvious word finds the right card
// even when it isn't in the display name — "google" should surface Search
// Console, "facebook" should surface Meta Ads, "twitter" should surface X Ads.
const ALIASES: Record<string, string> = {
  gsc: "google search console seo organic",
  ga4: "google analytics website traffic",
  gbp: "google business profile maps local",
  google_ads: "google adwords ppc paid search",
  sheets: "google spreadsheet",
  bigquery: "google data warehouse sql",
  youtube_analytics: "google video",
  meta_ads: "facebook instagram paid social",
  instagram: "meta facebook social",
  x_ads: "twitter paid social",
  tiktok_ads: "paid social video",
  pinterest_ads: "paid social",
  snapchat_ads: "paid social",
  linkedin_ads: "b2b paid social",
  microsoft_ads: "bing ppc paid search",
  amazon_ads: "retail media ppc",
  reddit_ads: "paid social",
  shopify: "ecommerce store orders revenue",
  woocommerce: "wordpress ecommerce store",
  stripe: "payments revenue billing",
  hubspot: "crm contacts deals",
  salesforce: "crm contacts deals",
  mailchimp: "email marketing newsletter",
  klaviyo: "email marketing ecommerce",
  activecampaign: "email marketing automation",
  constantcontact: "email marketing",
  campaignmonitor: "email marketing",
  callrail: "call tracking phone",
  ahrefs: "seo backlinks keywords",
  semrush: "seo backlinks keywords",
  moz: "seo domain authority",
  adobe_analytics: "omniture website traffic",
};

export function IntegrationSearch({ integrations }: { integrations: DataSourceCardData[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return integrations;
    // Every whitespace-separated term must match somewhere, so "google ads"
    // narrows rather than widening to everything Google.
    const terms = needle.split(/\s+/);
    return integrations.filter((i) => {
      const haystack = `${i.name} ${i.description} ${i.id} ${ALIASES[i.id] ?? ""}`.toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });
  }, [query, integrations]);

  return (
    <div>
      <div className="relative mb-5 max-w-md">
        <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search integrations — Google, Meta, TikTok, LinkedIn…"
          aria-label="Search integrations"
          className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 transition-colors hover:text-ink-700"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-300 bg-surface-subtle px-6 py-12 text-center">
          <p className="text-sm font-medium text-ink-800">No integrations match “{query}”</p>
          <p className="mt-1 text-sm text-ink-500">Try a platform name like Google, Meta, TikTok or Shopify.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((data) => (
            <DataSourceCard key={data.id} data={data} />
          ))}
        </div>
      )}
    </div>
  );
}
