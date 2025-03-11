import { LogLine } from "../../types/log";
import { AgentExecuteOptions, AgentResult } from "../../types/agent";
import { AgentClient, AgentExecutionOptions } from "./AgentClient";

/**
 * Main interface for agent operations in Stagehand
 * This class provides methods for executing tasks with an agent
 */
export class StagehandAgent {
  private client: AgentClient;
  private logger: (message: LogLine) => void;

  /**
   * Create a new StagehandAgent
   */
  constructor(client: AgentClient, logger: (message: LogLine) => void) {
    this.client = client;
    this.logger = logger;
  }

  /**
   * Execute a task with the agent
   */
  async execute(optionsOrInstruction: AgentExecuteOptions | string): Promise<AgentResult> {
    const options = typeof optionsOrInstruction === "string" 
      ? { instruction: optionsOrInstruction } 
      : optionsOrInstruction;
    
    this.logger({
      category: "agent",
      message: `Executing agent task: ${options.instruction}`,
      level: 1,
    });
    
    const executionOptions: AgentExecutionOptions = {
      options,
      logger: this.logger,
      retries: 3,
    };
    
    return await this.client.execute(executionOptions);
  }

  /**
   * Get the model name being used by the agent
   */
  getModelName(): string {
    return this.client.modelName;
  }

  /**
   * Get the agent type (provider)
   */
  getAgentType(): string {
    return this.client.type;
  }
} 