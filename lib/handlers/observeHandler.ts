import { LogLine } from "../../types/log";
import { Stagehand } from "../index";
import { observe } from "../inference";
import { LLMClient } from "../llm/LLMClient";
import { LLMProvider } from "../llm/LLMProvider";
import { generateId } from "../utils";
import { ScreenshotService } from "../vision";

export class StagehandObserveHandler {
  private readonly stagehand: Stagehand;
  private readonly logger: (logLine: LogLine) => void;
  private readonly waitForSettledDom: (
    domSettleTimeoutMs?: number,
  ) => Promise<void>;
  private readonly startDomDebug: () => Promise<void>;
  private readonly cleanupDomDebug: () => Promise<void>;
  private readonly llmProvider: LLMProvider;
  private readonly verbose: 0 | 1 | 2;
  private readonly llmClient: LLMClient;
  private observations: {
    [key: string]: {
      result: { selector: string; description: string }[];
      instruction: string;
    };
  };

  constructor({
    stagehand,
    logger,
    waitForSettledDom,
    startDomDebug,
    cleanupDomDebug,
    llmProvider,
    verbose,
    llmClient,
  }: {
    stagehand: Stagehand;
    logger: (logLine: LogLine) => void;
    waitForSettledDom: (domSettleTimeoutMs?: number) => Promise<void>;
    startDomDebug: () => Promise<void>;
    cleanupDomDebug: () => Promise<void>;
    llmProvider: LLMProvider;
    verbose: 0 | 1 | 2;
    llmClient: LLMClient;
  }) {
    this.stagehand = stagehand;
    this.logger = logger;
    this.waitForSettledDom = waitForSettledDom;
    this.startDomDebug = startDomDebug;
    this.cleanupDomDebug = cleanupDomDebug;
    this.llmProvider = llmProvider;
    this.verbose = verbose;
    this.llmClient = llmClient;
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
    llmClient,
    requestId,
    domSettleTimeoutMs,
    useAccessibilityTree = false,
  }: {
    instruction: string;
    useVision: boolean;
    fullPage: boolean;
    llmClient: LLMClient;
    requestId?: string;
    domSettleTimeoutMs?: number;
    useAccessibilityTree?: boolean;
  }): Promise<{ selector: string; description: string }[]> {
    if (!instruction) {
      instruction = `Find elements that can be used for any future actions in the page. These may be navigation links, related pages, section/subsection links, buttons, or other interactive elements. Be comprehensive: if there are multiple elements that may be relevant for future actions, return all of them.`;
    }
    this.logger({
      category: "observation",
      message: "starting observation",
      level: 1,
      auxiliary: {
        instruction: {
          value: instruction,
          type: "string",
        },
      },
    });

    await this.waitForSettledDom(domSettleTimeoutMs);
    await this.startDomDebug();

    let outputString: string;
    let selectorMap: { [key: string]: string[] };

    if (useAccessibilityTree) {
      const snapshot = await this.stagehand.page.accessibility.snapshot();
      const cleanedSnapshot = cleanObject(snapshot);
      outputString = formatAccessibilityTree(cleanedSnapshot);
      
      selectorMap = createAccessibilitySelectorMap(cleanedSnapshot);
      console.log(selectorMap);
    } else {
      const evalResult = await this.stagehand.page.evaluate(
        (fullPage: boolean) =>
          fullPage ? window.processAllOfDom() : window.processDom([]),
        fullPage,
      );
      outputString = evalResult.outputString;
      selectorMap = evalResult.selectorMap;
      console.log(selectorMap);
    }

    let annotatedScreenshot: Buffer | undefined;
    if (useVision === true) {
      if (!llmClient.hasVision) {
        this.logger({
          category: "observation",
          message: "Model does not support vision. Skipping vision processing.",
          level: 1,
          auxiliary: {
            model: {
              value: llmClient.modelName,
              type: "string",
            },
          },
        });
      } else {
        const screenshotService = new ScreenshotService(
          this.stagehand.page,
          selectorMap,
          this.verbose,
          this.logger,
        );

        annotatedScreenshot =
          await screenshotService.getAnnotatedScreenshot(fullPage);
        outputString = "n/a. use the image to find the elements.";
      }
    }

    const observationResponse = await observe({
      instruction,
      domElements: outputString,
      llmClient,
      image: annotatedScreenshot,
      requestId,
      useAccessibilityTree,
    });
    console.log(`\n\nobservationResponse: ${JSON.stringify(observationResponse)}`);
    const elementsWithSelectors = observationResponse.elements.map(
      (element) => {
        const { elementId, ...rest } = element;

        if (useAccessibilityTree) {
          return {
            ...rest,
            selector: selectorMap[elementId][0],
          };
        }

        return {
          ...rest,
          selector: `xpath=${selectorMap[elementId][0]}`,
        };
      },
    );

    await this.cleanupDomDebug();

    this.logger({
      category: "observation",
      message: "found elements",
      level: 1,
      auxiliary: {
        elements: {
          value: JSON.stringify(elementsWithSelectors),
          type: "object",
        },
      },
    });

    await this._recordObservation(instruction, elementsWithSelectors);
    return elementsWithSelectors;
  }
}

function createAccessibilitySelectorMap(
    node: any, 
    map: { [key: string]: string[] } = {}, 
    counter: { value: 0 } = { value: 0 }  // Use object to maintain count across recursion
): { [key: string]: string[] } {
    if (!node) return map;

    const selector = createAccessibilitySelector(node);
    if (selector) {
        const id = counter.value.toString();
        map[id] = [selector];
        counter.value++;
    }

    if (Array.isArray(node.children)) {
        node.children.forEach((child: any) => {
            createAccessibilitySelectorMap(child, map, counter);
        });
    }

    return map;
}

function createAccessibilitySelector(node: any): string | null {
    if (!node.role) return null;

    let selector = `role=${node.role}`;
    if (node.name) {
        selector += `[name='${node.name.replace(/'/g, "\\'")}']`;
    }
    // console.log(selector);
    return selector;
}

function cleanObject(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(cleanObject);
  }
  if (typeof obj === 'object' && obj !== null) {
    const cleaned = Object.fromEntries(
      Object.entries(obj)
        .filter(([_, value]) => value !== undefined)
        .map(([key, value]) => [key, cleanObject(value)])
    );
    // Preserve children as array if it exists
    if (obj.children) {
      cleaned.children = cleanObject(obj.children);
    }
    return cleaned;
  }
  return obj;
}


function formatAccessibilityTree(
    node: any, 
    level = 0, 
    counter: { value: 0 } = { value: 0 }
): string {
    if (!node) return '';
    
    const indent = '  '.repeat(level);
    const id = counter.value;
    let result = `${indent}[${id}] ${node.role || 'unknown'}: ${node.name || ''}\n`;
    
    if (node.role) {
        counter.value++; // Only increment for valid nodes with roles
    }
    
    if (Array.isArray(node.children)) {
        for (const child of node.children) {
            result += formatAccessibilityTree(child, level + 1, counter);
        }
    }
    
    return result;
}
