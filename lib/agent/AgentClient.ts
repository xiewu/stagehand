import { LogLine } from "../../types/log";
import { AgentExecuteOptions, AgentResult } from "../../types/agent";

/**
 * Available agent types
 */
export type AgentType = "openai" | "anthropic";

/**
 * Options for agent execution
 */
export interface AgentExecutionOptions {
  /**
   * The execution options
   */
  options: AgentExecuteOptions;

  /**
   * Logger function
   */
  logger: (message: LogLine) => void;

  /**
   * Number of retries on failure
   */
  retries?: number;
}

/**
 * Abstract base class for agent clients
 * This provides a common interface for all agent implementations
 */
export abstract class AgentClient {
  /**
   * Type of agent
   */
  public type: AgentType;

  /**
   * Name of the model used by this agent
   */
  public modelName: string;

  /**
   * Client options specific to this agent
   */
  public clientOptions: Record<string, unknown>;

  /**
   * Any special instructions for the agent
   */
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
}
