import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, CompletionRequest } from "../types";

// Anthropic (Claude) provider. Defaults to Claude Opus 4.8 — the most capable
// model — and can be pointed at a cheaper model with AI_MODEL (e.g.
// "claude-sonnet-4-6" or "claude-haiku-4-5") to trade some quality for cost.
export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic";
  private readonly model = process.env.AI_MODEL || "claude-opus-4-8";

  isConfigured(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  async complete(req: CompletionRequest): Promise<string | null> {
    const client = new Anthropic();
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
