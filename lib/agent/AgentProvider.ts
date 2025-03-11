import { LogLine } from "../../types/log";
import { AgentClient, AgentType } from "./AgentClient";
import { OpenAICUAClient } from "./OpenAICUAClient";

// Map model names to their provider types
const modelToAgentProviderMap: Record<string, AgentType> = {
  "computer-use-preview-2025-02-04": "openai",
  "claude-3-5-sonnet-20240620": "anthropic",
};

/**
 * Provider for agent clients
 * This class is responsible for creating the appropriate agent client
 * based on the provider type
 */
export class AgentProvider {
  private logger: (message: LogLine) => void;

  /**
   * Create a new agent provider
   */
  constructor(logger: (message: LogLine) => void) {
    this.logger = logger;
  }

  /**
   * Get an agent client for the specified agent type and model
   */
  getClient(
    type: AgentType,
    modelName: string,
    clientOptions?: Record<string, unknown>,
    userProvidedInstructions?: string
  ): AgentClient {
    this.logger({
      category: "agent",
      message: `Getting agent client for type: ${type}, model: ${modelName}`,
      level: 2,
    });

    try {
      switch (type) {
        case "openai":
          return new OpenAICUAClient(
            type,
            modelName,
            userProvidedInstructions,
            clientOptions
          );
        case "anthropic":
          // Fallback to OpenAI CUA client for now
          this.logger({
            category: "agent",
            message: `Anthropic CUA client not yet implemented, falling back to OpenAI CUA client`,
            level: 1,
          });
          return new OpenAICUAClient(
            "openai",
            "computer-use-preview-2025-02-04", // Fall back to a reliable model
            userProvidedInstructions,
            clientOptions
          );
        default:
          throw new Error(`Unknown agent type: ${type}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger({
        category: "agent",
        message: `Error creating agent client: ${errorMessage}`,
        level: 0,
      });
      throw error;
    }
  }

  /**
   * Get the provider type for a model name
   */
  static getAgentProvider(modelName: string): AgentType {
    // First check the exact model name in the map
    if (modelName in modelToAgentProviderMap) {
      return modelToAgentProviderMap[modelName];
    }

    // Default to OpenAI CUA for unrecognized models with warning
    console.warn(`Unknown model name: ${modelName}, defaulting to OpenAI CUA`);
    return "openai";
  }
} 