import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, CompletionRequest } from "../types";

// Anthropic (Claude) provider. Defaults to Claude Opus 4.8 — the most capable
// model — and can be pointed at a cheaper model with AI_MODEL (e.g.
// "claude-sonnet-4-6" or "claude-haiku-4-5") to trade some quality for cost.
// Report generation runs under a 60-second function limit and reserves the
// plan's report allowance BEFORE this call. Left to the SDK defaults (a
// 10-minute timeout plus two retries), a slow answer got the whole request
// killed: no report, allowance spent. Bounded here, a slow model costs only the
// written analysis; the report itself still generates.
export const AI_TIMEOUT_MS = 40_000;

export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic";
  readonly model = process.env.AI_MODEL || "claude-opus-4-8";

  isConfigured(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  async complete(req: CompletionRequest): Promise<string | null> {
    const client = new Anthropic({ timeout: AI_TIMEOUT_MS, maxRetries: 0 });
    const res = await client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 4096,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: req.schema },
      },
      system: req.system,
      messages: [{ role: "user", content: req.prompt }],
    });

    if (res.stop_reason === "refusal") return null;
    return res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? null;
  }
}
