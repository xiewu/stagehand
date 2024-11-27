import { LLMProvider } from "../llm/LLMProvider";
import { Stagehand } from "../index";
import { z } from "zod";
import { LogLine } from "../../types/log";
import { extract } from "../inference";
import { LLMClient } from "../llm/LLMClient";
import { formatText } from "../utils";

export class StagehandExtractHandler {
  private readonly stagehand: Stagehand;

  private readonly logger: (logLine: LogLine) => void;
  private readonly waitForSettledDom: (
    domSettleTimeoutMs?: number,
  ) => Promise<void>;
  private readonly startDomDebug: () => Promise<void>;
  private readonly cleanupDomDebug: () => Promise<void>;
  private readonly llmProvider: LLMProvider;
  private readonly llmClient: LLMClient;
  private readonly verbose: 0 | 1 | 2;

  constructor({
    stagehand,
    logger,
    waitForSettledDom,
    startDomDebug,
    cleanupDomDebug,
    llmProvider,
    llmClient,
    verbose,
  }: {
    stagehand: Stagehand;
    logger: (message: {
      category?: string;
      message: string;
      level?: number;
      auxiliary?: { [key: string]: { value: string; type: string } };
    }) => void;
    waitForSettledDom: (domSettleTimeoutMs?: number) => Promise<void>;
    startDomDebug: () => Promise<void>;
    cleanupDomDebug: () => Promise<void>;
    llmProvider: LLMProvider;
    llmClient: LLMClient;
    verbose: 0 | 1 | 2;
  }) {
    this.stagehand = stagehand;
    this.logger = logger;
    this.waitForSettledDom = waitForSettledDom;
    this.startDomDebug = startDomDebug;
    this.cleanupDomDebug = cleanupDomDebug;
    this.llmProvider = llmProvider;
    this.llmClient = llmClient;
    this.verbose = verbose;
  }

  public async extract<T extends z.AnyZodObject>({
    instruction,
    schema,
    content = {},
    llmClient,
    requestId,
    domSettleTimeoutMs,
  }: {
    instruction: string;
    schema: T;
    content?: z.infer<T>;
    llmClient: LLMClient;
    requestId?: string;
    domSettleTimeoutMs?: number;
  }): Promise<z.infer<T>> {
    this.logger({
      category: "extraction",
      message: "starting extraction",
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

    const originalDOM = await this.stagehand.page.evaluate(() => window.storeDOM());

    const { selectorMap }: { selectorMap: Record<number, string[]> } =
      await this.stagehand.page.evaluate(() => window.processAllOfDom());

    this.logger({
      category: "extraction",
      message: `received output from processAllOfDom. selectorMap has ${Object.keys(selectorMap).length} entries`,
      level: 1,
    });
    const PROXIMITY_THRESHOLD = 10;
    await this.stagehand.page.evaluate(() => window.createTextBoundingBoxes());
    const pageWidth = await this.stagehand.page.evaluate(() => window.innerWidth);
    const pageHeight = await this.stagehand.page.evaluate(() => window.innerHeight);

    const seenAnnotations = new Map();
    const textAnnotations: TextAnnotation[] = [];

    for (const xpaths of Object.values(selectorMap)) {
      const xpath = xpaths[0];

      const boundingBoxes: Array<{
        text: string;
        left: number;
        top: number;
        width: number;
        height: number;
      }> = await this.stagehand.page.evaluate(
        (xpath) => window.getElementBoundingBoxes(xpath),
        xpath
      );

      for (const box of boundingBoxes) {
        const text = box.text;

        let annotationsForText = seenAnnotations.get(text);
        if (!annotationsForText) {
          annotationsForText = [];
          seenAnnotations.set(text, annotationsForText);
        }

        const isDuplicate = annotationsForText.some((annotation) => {
          const dx = annotation.x - (box.left + box.width / 2);
          const dy = annotation.y - (box.top + box.height / 2);
          const distance = Math.sqrt(dx * dx + dy * dy);
          return distance < PROXIMITY_THRESHOLD;
        });

        if (!isDuplicate) {
          annotationsForText.push({
            x: box.left + box.width / 2,
            y: box.top + box.height / 2,
          });

          textAnnotations.push({
            text: box.text,
            midpoint: {
              x: box.left,
              y: box.top + box.height,
            },
            midpoint_normalized: {
              x: box.left / pageWidth,
              y: (box.top + box.height) / pageHeight,
            },
            width: box.width,
            height: box.height,
          });
        }
      }
    }

    await this.stagehand.page.evaluate((dom) => window.restoreDOM(dom), originalDOM);
    const formattedText = formatText(textAnnotations);

    // const fs = require("fs");
    // const formattedTextFilePath = "./formattedText.txt";
    // fs.writeFileSync(formattedTextFilePath, formattedText);

    const extractionResponse = await extract({
      instruction,
      previouslyExtractedContent: content,
      domElements: formattedText,
      schema,
      llmClient,
      requestId,
    });

    const {
      metadata: { completed },
      ...output
    } = extractionResponse;

    await this.cleanupDomDebug();

    this.logger({
      category: "extraction",
      message: "received extraction response",
      auxiliary: {
        extraction_response: {
          value: JSON.stringify(extractionResponse),
          type: "object",
        },
      },
    });

    if (completed) {
      this.logger({
        category: "extraction",
        message: "extraction completed successfully",
        level: 1,
      });
    } else {
      this.logger({
        category: "extraction",
        message: "extraction incomplete after processing all data",
        level: 1,
        auxiliary: {
          extraction_response: {
            value: JSON.stringify(extractionResponse),
            type: "object",
          },
        },
      });
    }
    return output;
  }
}
