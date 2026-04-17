import Anthropic from "@anthropic-ai/sdk";

export interface LLMRequest {
  prompt: string;
  max_tokens?: number;
  model?: string;
}

export interface LLMClient {
  complete(req: LLMRequest): Promise<string>;
}

export class AnthropicClient implements LLMClient {
  private readonly client: Anthropic;
  private readonly defaultModel: string;
  constructor(apiKey: string, defaultModel: string) {
    this.client = new Anthropic({ apiKey });
    this.defaultModel = defaultModel;
  }
  async complete(req: LLMRequest): Promise<string> {
    const resp = await this.client.messages.create(
      {
        model: req.model ?? this.defaultModel,
        max_tokens: req.max_tokens ?? 4096,
        messages: [{ role: "user", content: req.prompt }],
      },
      { timeout: 60_000 }
    );
    const text = resp.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((b) => b.text)
      .join("\n");
    return text;
  }
}

export class MockLLMClient implements LLMClient {
  private readonly responses: string[];
  private idx = 0;
  public lastPrompts: string[] = [];
  constructor(responses: string[]) { this.responses = responses; }
  async complete(req: LLMRequest): Promise<string> {
    this.lastPrompts.push(req.prompt);
    if (this.idx >= this.responses.length) throw new Error("MockLLMClient: no more canned responses");
    return this.responses[this.idx++]!;
  }
}

export class OpenAIClient implements LLMClient {
  constructor(_apiKey: string, _defaultModel: string) {}
  async complete(_req: LLMRequest): Promise<string> { throw new Error("OpenAI provider not implemented in v1"); }
}
export class DeepSeekClient implements LLMClient {
  constructor(_apiKey: string, _defaultModel: string) {}
  async complete(_req: LLMRequest): Promise<string> { throw new Error("DeepSeek provider not implemented in v1"); }
}

export function createClient(provider: "anthropic" | "openai" | "deepseek", apiKey: string, model: string): LLMClient {
  if (provider === "anthropic") return new AnthropicClient(apiKey, model);
  if (provider === "openai") return new OpenAIClient(apiKey, model);
  return new DeepSeekClient(apiKey, model);
}
