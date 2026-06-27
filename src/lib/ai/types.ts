// Shared types for the AI insights module. No provider SDK imported here, so
// these are safe to reference from anywhere (including type-only imports).

export type Totals = { clicks: number; impressions: number; ctr: number; position: number };

type Row = { key: string; clicks: number; impressions: number; ctr: number; position: number };
type Mover = { key: string; clicks: number; prevClicks: number; changePct: number; position: number };
type Opportunity = { key: string; clicks: number; impressions: number; position: number };

// Everything the model is allowed to analyze — all sourced from the cached
// Search Console snapshot in the database. No live API data ever flows in here.
export type InsightsInput = {
  clientName: string;
  periodLabel: string;
  totals: Totals;
  previousTotals?: Totals | null;
  topQueries: Row[];
  topPages: Row[];
  topCountries?: Row[];
  topDevices?: Row[];
  movers?: { winners: Mover[]; decliners: Mover[]; opportunities: Opportunity[] } | null;
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
