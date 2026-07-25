"use client";

// Client boundary that lazy-loads the recharts-based analytics views with
// ssr:false (perf audit P1-6). Because this is a Client Component, ssr:false is
// permitted — so recharts and every chart view are split into async chunks and
// kept out of the client-detail route's initial JS entirely, loading only when a
// synced snapshot actually renders. A skeleton holds space to avoid layout shift.
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { GscReportData } from "@/components/GscAnalytics";
import type { Ga4ReportData } from "@/components/Ga4Analytics";
import type { AdsReportData } from "@/components/AdsAnalytics";
import type { SocialReport } from "@/lib/integrations/social";
import type { GbpReport, CommerceReport, SheetTable, CrmReport, EmailReport, CallReport, SeoReport, VideoReport, BigQueryReport } from "@/lib/integrations/metrics";

// Shared skeleton fallback. next/dynamic requires the options object to be an
// inline literal (SWC analyzes it statically), so it's repeated per call.
function ChartSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

const GscAnalytics = dynamic(() => import("@/components/GscAnalytics").then((m) => m.GscAnalytics), { ssr: false, loading: ChartSkeleton });
const Ga4Analytics = dynamic(() => import("@/components/Ga4Analytics").then((m) => m.Ga4Analytics), { ssr: false, loading: ChartSkeleton });
const SocialAnalytics = dynamic(() => import("@/components/SocialAnalytics").then((m) => m.SocialAnalytics), { ssr: false, loading: ChartSkeleton });
const AdsAnalytics = dynamic(() => import("@/components/AdsAnalytics").then((m) => m.AdsAnalytics), { ssr: false, loading: ChartSkeleton });
const GbpAnalytics = dynamic(() => import("@/components/GbpAnalytics").then((m) => m.GbpAnalytics), { ssr: false, loading: ChartSkeleton });
const CommerceAnalytics = dynamic(() => import("@/components/CommerceAnalytics").then((m) => m.CommerceAnalytics), { ssr: false, loading: ChartSkeleton });
const SheetsAnalytics = dynamic(() => import("@/components/SheetsAnalytics").then((m) => m.SheetsAnalytics), { ssr: false, loading: ChartSkeleton });
const BigQueryAnalytics = dynamic(() => import("@/components/BigQueryAnalytics").then((m) => m.BigQueryAnalytics), { ssr: false, loading: ChartSkeleton });
const CrmAnalytics = dynamic(() => import("@/components/CrmAnalytics").then((m) => m.CrmAnalytics), { ssr: false, loading: ChartSkeleton });
const EmailAnalytics = dynamic(() => import("@/components/EmailAnalytics").then((m) => m.EmailAnalytics), { ssr: false, loading: ChartSkeleton });
const CallAnalytics = dynamic(() => import("@/components/CallAnalytics").then((m) => m.CallAnalytics), { ssr: false, loading: ChartSkeleton });
const SeoAnalytics = dynamic(() => import("@/components/SeoAnalytics").then((m) => m.SeoAnalytics), { ssr: false, loading: ChartSkeleton });
const VideoAnalytics = dynamic(() => import("@/components/VideoAnalytics").then((m) => m.VideoAnalytics), { ssr: false, loading: ChartSkeleton });

const ADS_VIZ = new Set(["google_ads", "meta_ads", "linkedin_ads", "tiktok_ads", "microsoft_ads", "pinterest_ads", "snapchat_ads", "reddit_ads", "amazon_ads", "x_ads"]);
const COMMERCE_VIZ = new Set(["shopify", "woocommerce", "stripe"]);
const EMAIL_VIZ = new Set(["mailchimp", "klaviyo", "activecampaign", "constantcontact", "campaignmonitor"]);
const SEO_VIZ = new Set(["ahrefs", "semrush", "moz"]);

// Provider-specific analytics view (each source visualizes different metrics).
export function ClientAnalytics({ id, snapshot }: { id: string; snapshot: unknown }) {
  if (!snapshot) return null;
  if (id === "gsc") return <GscAnalytics report={snapshot as GscReportData} />;
  if (id === "ga4") return <Ga4Analytics report={snapshot as Ga4ReportData} />;
  if (id === "adobe_analytics") return <Ga4Analytics report={snapshot as Ga4ReportData} />;
  if (id === "instagram") return <SocialAnalytics report={snapshot as SocialReport} />;
  if (ADS_VIZ.has(id)) return <AdsAnalytics report={snapshot as AdsReportData} />;
  if (id === "gbp") return <GbpAnalytics report={snapshot as GbpReport} />;
  if (COMMERCE_VIZ.has(id)) return <CommerceAnalytics report={snapshot as CommerceReport} />;
  if (id === "sheets") return <SheetsAnalytics report={snapshot as SheetTable} />;
  if (id === "bigquery") return <BigQueryAnalytics report={snapshot as BigQueryReport} />;
  if (id === "hubspot" || id === "salesforce") return <CrmAnalytics report={snapshot as CrmReport} />;
  if (EMAIL_VIZ.has(id)) return <EmailAnalytics report={snapshot as EmailReport} />;
  if (id === "callrail") return <CallAnalytics report={snapshot as CallReport} />;
  if (SEO_VIZ.has(id)) return <SeoAnalytics report={snapshot as SeoReport} />;
  if (id === "youtube_analytics") return <VideoAnalytics report={snapshot as VideoReport} />;
  return null;
}
