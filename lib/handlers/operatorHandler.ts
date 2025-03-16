import { LogLine } from "@/types/log";
import { StagehandPage } from "../StagehandPage";
import { AgentAction, AgentExecuteOptions } from "@/types/agent";
import { AgentResult } from "@/types/agent";
import { ChatMessage, LLMClient } from "../llm/LLMClient";
import { buildOperatorSystemPrompt } from "../prompt";
import { z } from "zod";
import { LLMParsedResponse } from "../inference";

const operatorResponseSchema = z.object({
  reasoning: z.string().describe("The reasoning for the step taken"),
  method: z.enum([
    "act",
    "extract",
    "goto",
    "close",
    "wait",
    "navback",
    "refresh",
  ])
    .describe(`The action to perform on the page based off of the goal and the current state of the page.
    goto: Navigate to a specific URL.
    act: Perform an action on the page.  
    extract: Extract data from the page.
    close: The task is complete, close the browser.
    wait: Wait for a period of time.
    navback: Navigate back to the previous page. Do not navigate back if you are already on the first page.
    refresh: Refresh the page.`),
  parameters: z
    .string()
    .describe(
      `The parameter for the action. Only pass in a parameter for the following methods:
      - act: The action to perform. e.g. "click on the submit button" or "type [email] into the email input field and press enter"
      - extract: The data to extract. e.g. "the title of the article". If you want to extract all of the text on the page, leave this undefined.
      - wait: The amount of time to wait in milliseconds.
      - goto: The URL to navigate to. e.g. "https://www.google.com"
      The other methods do not require a parameter.`,
    )
    .optional(),
  taskComplete: z
    .boolean()
    .describe(
      "Whether the task is complete. If true, the task is complete and the browser should be closed. If you chose to close the browser because the task failed, set this to false.",
    ),
});

export class StagehandOperatorHandler {
  private stagehandPage: StagehandPage;
  private logger: (message: LogLine) => void;
  private llmClient: LLMClient;
  messages: ChatMessage[];

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
    const maxSteps = options.maxSteps || 10;
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

        this.messages.push({
          role: "user",
          content: [
            {
              type: "text",
              text: `Here is a screenshot of the current page (URL: ${url}):`,
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
        completed: result.taskComplete,
      });

      currentStep++;

      await this.executeAction(result);
    }

    return {
      success: true,
      message: actions[actions.length - 1].reasoning as string,
      actions,
      completed: actions[actions.length - 1].completed as boolean,
    };
  }

  private async getNextStep(
    currentStep: number,
  ): Promise<z.infer<typeof operatorResponseSchema>> {
    const { data: response } = (await this.llmClient.createChatCompletion<
      z.infer<typeof operatorResponseSchema>
    >({
      options: {
        messages: this.messages,
        response_model: {
          name: "operatorResponseSchema",
          schema: operatorResponseSchema,
        },
        requestId: `operator-step-${currentStep}`,
      },
      logger: this.logger,
    })) as LLMParsedResponse<z.infer<typeof operatorResponseSchema>>;

    return response;
  }

  private async executeAction(
    action: z.infer<typeof operatorResponseSchema>,
  ): Promise<unknown> {
    console.log(action);
    const { method, parameters } = action;
    const page = this.stagehandPage.page;

    switch (method) {
      case "act":
        await page.act({ action: parameters, slowDomBasedAct: false });
        break;
      case "extract":
        return await page.extract(parameters);
      case "goto":
        await page.goto(parameters, { waitUntil: "domcontentloaded" });
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
