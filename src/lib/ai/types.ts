// Shared types for the AI insights module. No provider SDK imported here, so
// these are safe to reference from anywhere (including type-only imports).

export type Totals = { clicks: number; impressions: number; ctr: number; position: number };

type Row = { key: string; clicks: number; impressions: number; ctr: number; position: number };
type Mover = { key: string; clicks: number; prevClicks: number; changePct: number; position: number };
type Opportunity = { key: string; clicks: number; impressions: number; position: number };

export type Ga4Totals = {
  users: number;
  newUsers: number;
  sessions: number;
  engagedSessions: number;
  engagementRate: number;
  avgEngagementTime: number;
  views: number;
  conversions: number;
  totalRevenue: number;
};
type Ga4Dim = { key: string; sessions: number; users: number };

// Search Console signals available to the model.
export type GscInsights = {
  totals: Totals;
  previousTotals?: Totals | null;
  topQueries: Row[];
  topPages: Row[];
  topCountries?: Row[];
  topDevices?: Row[];
  movers?: { winners: Mover[]; decliners: Mover[]; opportunities: Opportunity[] } | null;
};

// GA4 (engagement/conversion) signals available to the model.
export type Ga4InsightsData = {
  totals: Ga4Totals;
  previousTotals?: Ga4Totals | null;
  trafficSources?: Ga4Dim[];
  topLandingPages?: Ga4Dim[];
  devices?: Ga4Dim[];
  countries?: Ga4Dim[];
};

// Everything the model may analyze — all sourced from cached snapshots in the
// database. Either source may be absent; the prompt degrades gracefully.
export type InsightsInput = {
  clientName: string;
  periodLabel: string;
  gsc?: GscInsights | null;
  ga4?: Ga4InsightsData | null;
};

// The structured, client-ready insight groups the report renders.
export type ReportInsights = {
  executiveSummary: string;
  keyWins: string[];
  issuesDetected: string[];
  growthOpportunities: string[];
  recommendedActions: string[];
};

export type CompletionRequest = {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
};

// A pluggable AI backend. Implement this to add a new provider (OpenAI, Gemini,
// a local model, …) and register it in the provider map in ./index.ts.
export interface AIProvider {
  readonly id: string;
  isConfigured(): boolean;
  // Returns the model's JSON text (conforming to the schema), or null on a
  // refusal/empty response. Implementations should not throw for an unusable
  // response — return null so callers can degrade gracefully.
  complete(req: CompletionRequest): Promise<string | null>;
}
