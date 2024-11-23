import { AvailableModel, LLMProvider } from "../llm/LLMProvider";
import { observe } from "../inference";
import { ScreenshotService } from "../vision";
import { modelsWithVision } from "../llm/LLMClient";
import { Stagehand } from "../index";
import { generateId } from "../utils";

export class StagehandObserveHandler {
  private readonly stagehand: Stagehand;
  private readonly llmProvider: LLMProvider;
  private readonly defaultModelName: AvailableModel;
  private readonly logger: (message: {
    category?: string;
    message: string;
  }) => void;
  private readonly waitForSettledDom: (
    domSettleTimeoutMs?: number,
  ) => Promise<void>;
  private readonly startDomDebug: () => Promise<void>;
  private readonly cleanupDomDebug: () => Promise<void>;
  private observations: {
    [key: string]: {
      result: { selector: string; description: string }[];
      instruction: string;
    };
  };

  constructor({
    stagehand,
    llmProvider,
    defaultModelName,
    logger,
    waitForSettledDom,
    startDomDebug,
    cleanupDomDebug,
  }: {
    stagehand: Stagehand;
    llmProvider: LLMProvider;
    defaultModelName: AvailableModel;
    logger: ({
      category,
      message,
    }: {
      category: string;
      message: string;
    }) => void;
    waitForSettledDom: (domSettleTimeoutMs?: number) => Promise<void>;
    startDomDebug: () => Promise<void>;
    cleanupDomDebug: () => Promise<void>;
  }) {
    this.stagehand = stagehand;
    this.llmProvider = llmProvider;
    this.defaultModelName = defaultModelName;
    this.logger = logger;
    this.waitForSettledDom = waitForSettledDom;
    this.startDomDebug = startDomDebug;
    this.cleanupDomDebug = cleanupDomDebug;
    this.observations = {};
  }

  private async _recordObservation(
    instruction: string,
    result: { selector: string; description: string }[],
  ): Promise<string> {
    const id = generateId(instruction);

    this.observations[id] = { result, instruction };

    return id;
  }

  public async observe({
    instruction,
    useVision,
    fullPage,
    modelName,
    requestId,
    domSettleTimeoutMs,
  }: {
    instruction: string;
    useVision: boolean;
    fullPage: boolean;
    modelName?: AvailableModel;
    requestId?: string;
    domSettleTimeoutMs?: number;
  }): Promise<{ selector: string; description: string }[]> {
    if (!instruction) {
      instruction = `Find elements that can be used for any future actions in the page. These may be navigation links, related pages, section/subsection links, buttons, or other interactive elements. Be comprehensive: if there are multiple elements that may be relevant for future actions, return all of them.`;
    }

    const model = modelName ?? this.defaultModelName;

    this.logger({
      category: "observation",
      message: `starting observation: ${instruction}`,
    });

    await this.waitForSettledDom(domSettleTimeoutMs);
    await this.startDomDebug();
    let { outputString, selectorMap } = await this.stagehand.page.evaluate(
      (fullPage: boolean) =>
        fullPage ? window.processAllOfDom() : window.processDom([]),
      fullPage,
    );

    let annotatedScreenshot: Buffer | undefined;
    if (useVision === true) {
      if (!modelsWithVision.includes(model)) {
        this.logger({
          category: "observation",
          message: `${model} does not support vision. Skipping vision processing.`,
        });
      } else {
        const screenshotService = new ScreenshotService(
          this.stagehand.page,
          selectorMap,
          this.stagehand.verbose,
        );

        annotatedScreenshot =
          await screenshotService.getAnnotatedScreenshot(fullPage);
        outputString = "n/a. use the image to find the elements.";
      }
    }

    const observationResponse = await observe({
      instruction,
      domElements: outputString,
      llmProvider: this.llmProvider,
      modelName: modelName || this.defaultModelName,
      image: annotatedScreenshot,
      requestId,
    });

    const elementsWithSelectors = observationResponse.elements.map(
      (element) => {
        const { elementId, ...rest } = element;

        return {
          ...rest,
          selector: `xpath=${selectorMap[elementId][0]}`,
        };
      },
    );

    await this.cleanupDomDebug();

    this._recordObservation(instruction, elementsWithSelectors);

    this.logger({
      category: "observation",
      message: `found element ${JSON.stringify(elementsWithSelectors)}`,
    });

    await this._recordObservation(instruction, elementsWithSelectors);
    return elementsWithSelectors;
  }
}
