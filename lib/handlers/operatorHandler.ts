import {
  AgentAction,
  AgentExecuteOptions,
  AgentResult,
  ActionExecutionResult,
} from "@/types/agent";
import { LogLine } from "@/types/log";
import { OperatorResponse, operatorResponseSchema } from "@/types/operator";
import { LLMParsedResponse } from "../inference";
import { ChatMessage, LLMClient } from "../llm/LLMClient";
import { buildOperatorSystemPrompt } from "../prompt";
import { StagehandPage } from "../StagehandPage";

export class StagehandOperatorHandler {
  private stagehandPage: StagehandPage;
  private logger: (message: LogLine) => void;
  private llmClient: LLMClient;
  messages: ChatMessage[];
  private lastActionResult: ActionExecutionResult | null = null;
  private lastMethod: string | null = null;

  constructor(
    stagehandPage: StagehandPage,
    logger: (message: LogLine) => void,
    llmClient: LLMClient,
  ) {
    this.stagehandPage = stagehandPage;
    this.logger = logger;
    this.llmClient = llmClient;
  }

  public async execute(
    instructionOrOptions: string | AgentExecuteOptions,
  ): Promise<AgentResult> {
    const options =
      typeof instructionOrOptions === "string"
        ? { instruction: instructionOrOptions }
        : instructionOrOptions;

    this.messages = [buildOperatorSystemPrompt(options.instruction)];
    let completed = false;
    let currentStep = 0;
    const maxSteps = options.maxSteps || 4;
    const actions: AgentAction[] = [];

    while (!completed && currentStep < maxSteps) {
      const url = this.stagehandPage.page.url();

      if (!url || url === "about:blank") {
        this.messages.push({
          role: "user",
          content: [
            {
              type: "text",
              text: "No page is currently loaded. The first step should be a 'goto' action to navigate to a URL.",
            },
          ],
        });
      } else {
        const screenshot = await this.stagehandPage.page.screenshot({
          type: "png",
          fullPage: false,
        });

        const base64Image = screenshot.toString("base64");

        let messageText = `Here is a screenshot of the current page (URL: ${url}):`;

        if (this.lastMethod && this.lastActionResult) {
          const statusMessage = this.lastActionResult.success
            ? "was successful"
            : `failed with error: ${this.lastActionResult.error}`;

          messageText = `Previous action '${this.lastMethod}' ${statusMessage}.\n\n${messageText}`;

          if (
            this.lastMethod === "extract" &&
            this.lastActionResult.success &&
            this.lastActionResult.data
          ) {
            messageText = `Previous extraction result: ${JSON.stringify(this.lastActionResult.data, null, 2)}\n\n${messageText}`;
          }
        }

        this.messages.push({
          role: "user",
          content: [
            {
              type: "text",
              text: messageText,
            },
            {
              type: "image_url",
              image_url: { url: `data:image/png;base64,${base64Image}` },
            },
          ],
        });
      }

      const result = await this.getNextStep(currentStep);

      if (result.method === "close") {
        completed = true;
      }

      actions.push({
        type: result.method,
        reasoning: result.reasoning,
        taskCompleted: result.taskComplete,
      });

      currentStep++;

      try {
        const actionResult = await this.executeAction(result);
        this.lastActionResult = {
          success: true,
          data: actionResult,
        };
      } catch (error) {
        this.lastActionResult = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      this.lastMethod = result.method;
    }

    return {
      success: true,
      message: actions[actions.length - 1].reasoning as string,
      actions,
      completed: actions[actions.length - 1].taskCompleted as boolean,
    };
  }

  private async getNextStep(currentStep: number): Promise<OperatorResponse> {
    const { data: response } =
      (await this.llmClient.createChatCompletion<OperatorResponse>({
        options: {
          messages: this.messages,
          response_model: {
            name: "operatorResponseSchema",
            schema: operatorResponseSchema,
          },
          requestId: `operator-step-${currentStep}`,
        },
        logger: this.logger,
      })) as LLMParsedResponse<OperatorResponse>;

    return response;
  }

  private async executeAction(action: OperatorResponse): Promise<unknown> {
    console.log(action);
    const { method, parameters } = action;
    const page = this.stagehandPage.page;

    switch (method) {
      case "act":
        await page.act({
          action: parameters,
          slowDomBasedAct: false,
          timeoutMs: 5000,
        });
        break;
      case "extract":
        return await page.extract(parameters);
      case "goto":
        await page.goto(parameters, { waitUntil: "load" });
        break;
      case "close":
        await page.close();
        break;
      case "wait":
        await page.waitForTimeout(parseInt(parameters));
        break;
      case "navback":
        await page.goBack();
        break;
      case "refresh":
        await page.reload();
        break;
      default:
        throw new Error(`Unknown action: ${method}`);
    }
  }
}
