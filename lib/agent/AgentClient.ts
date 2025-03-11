import { LogLine } from "../../types/log";
import { AgentAction, AgentExecuteOptions, AgentResult } from "../../types/agent";

// TODO: MOVE TO TYPES
export type AgentType = "openai" | "anthropic";

export interface AgentExecutionOptions {
  options: AgentExecuteOptions;
  logger: (message: LogLine) => void;
  retries?: number;
}

/**
 * Abstract base class for agent clients
 * This provides a common interface for all agent implementations
 */
export abstract class AgentClient {
  public type: AgentType;
  public modelName: string;
  public clientOptions: Record<string, unknown>;
  public userProvidedInstructions?: string;

  /**
   * Create a new agent client
   */
  constructor(
    type: AgentType,
    modelName: string,
    userProvidedInstructions?: string,
  ) {
    this.type = type;
    this.modelName = modelName;
    this.userProvidedInstructions = userProvidedInstructions;
    this.clientOptions = {};
  }

  /**
   * Execute a task with the agent
   */
  abstract execute(options: AgentExecutionOptions): Promise<AgentResult>;

  /**
   * Take a screenshot and send it to the agent
   */
  abstract captureScreenshot(
    options?: Record<string, unknown>,
  ): Promise<unknown>;

  /**
   * Set viewport dimensions for the agent
   */
  abstract setViewport(width: number, height: number): void;

  /**
   * Set the current URL for the agent
   */
  abstract setCurrentUrl(url: string): void;

  /**
   * Set a callback function that provides screenshots
   */
  abstract setScreenshotProvider(provider: () => Promise<string>): void;

  /**
   * Set a callback function that executes actions
   */
  abstract setActionHandler(handler: (action: AgentAction) => Promise<void>): void;
}