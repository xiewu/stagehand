import { OpenAIClient } from "./OpenAIClient";
import { AnthropicClient } from "./AnthropicClient";
import { LLMClient } from "./LLMClient";
import { LLMCache } from "../cache/LLMCache";

export type AvailableModel =
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gpt-4o-2024-08-06"
  | "claude-3-5-sonnet-latest"
  | "claude-3-5-sonnet-20241022"
  | "claude-3-5-sonnet-20240620";

export type AvailableProvider = "openai" | "anthropic";

const modelToProviderMap: { [key in AvailableModel]: AvailableProvider } = {
  "gpt-4o": "openai",
  "gpt-4o-mini": "openai",
  "gpt-4o-2024-08-06": "openai",
  "claude-3-5-sonnet-latest": "anthropic",
  "claude-3-5-sonnet-20240620": "anthropic",
  "claude-3-5-sonnet-20241022": "anthropic",
};

export class LLMProvider {
  private logger: (message: { category?: string; message: string }) => void;
  private enableCaching: boolean;
  private cache: LLMCache;

  constructor(
    logger: (message: { category?: string; message: string }) => void,
    enableCaching: boolean,
  ) {
    this.logger = logger;
    this.enableCaching = enableCaching;
    this.cache = new LLMCache(logger);
  }

  cleanRequestCache(requestId: string): void {
    this.logger({
      category: "llm_cache",
      message: `Cleaning up cache for requestId: ${requestId}`,
    });
    this.cache.deleteCacheForRequestId(requestId);
  }

  static getDefaultModelName(
    initModelName?: AvailableModel,
    openaiApiKey?: string,
    anthropicApiKey?: string,
  ): AvailableModel {
    /**
     * If no initModelName is provided, use the API key to determine the model
     *
     * For example, if the OpenAI API key is present, the default model is gpt-4o
     * If the Anthropic API key is present, the default model is claude-3-5-sonnet-20241022
     * If the initModelName is provided, assert the API key exists
     */
    if (initModelName) {
      const provider = modelToProviderMap[initModelName];
      if (provider === "openai" && !openaiApiKey) {
        throw new Error(`OpenAI API key required for model ${initModelName}`);
      }
      if (provider === "anthropic" && !anthropicApiKey) {
        throw new Error(
          `Anthropic API key required for model ${initModelName}`,
        );
      }
      return initModelName;
    }

    if (openaiApiKey) {
      return "gpt-4o";
    }
    if (anthropicApiKey) {
      return "claude-3-5-sonnet-20241022";
    }
    throw new Error(
      "No API keys found - must provide either OpenAI or Anthropic API key",
    );
  }

  getClient(modelName: AvailableModel, requestId: string): LLMClient {
    const provider = modelToProviderMap[modelName];
    if (!provider) {
      throw new Error(`Unsupported model: ${modelName}`);
    }

    switch (provider) {
      case "openai":
        return new OpenAIClient(
          this.logger,
          this.enableCaching,
          this.cache,
          requestId,
        );
      case "anthropic":
        return new AnthropicClient(
          this.logger,
          this.enableCaching,
          this.cache,
          requestId,
        );
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }
}
