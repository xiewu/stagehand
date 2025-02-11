import { z } from "zod";
import { LogLine } from "../../types/log";
import { TextAnnotation } from "../../types/textannotation";
import { extract } from "../inference";
import { LLMClient } from "../llm/LLMClient";
import { formatText } from "../utils";
import { StagehandPage } from "../StagehandPage";
import { ObserveResult, Stagehand } from "../index";
import { ExtractionTarget } from "@/types/handler";
import fs from "fs";

const PROXIMITY_THRESHOLD = 15;

/**
 * The `StagehandExtractHandler` class is responsible for extracting structured data from a webpage.
 * It provides two approaches: `textExtract` and `domExtract`. `textExtract` is used by default.
 *
 * Here is what `textExtract` does at a high level:
 *
 * **1. Wait for the DOM to settle and start DOM debugging.**
 *    - Ensures the page is fully loaded and stable before extraction.
 *
 * **2. Store the original DOM before any mutations.**
 *    - Preserves the initial state of the DOM to restore later.
 *    - We do this because creating spans around every word in the DOM (see step 4)
 *      becomes very difficult to revert. Text nodes can be finicky, and directly
 *      removing the added spans often corrupts the structure of the DOM.
 *
 * **3. Process the DOM to generate a selector map of candidate elements.**
 *    - Identifies potential elements that contain the data to extract.
 *
 * **4. Create text bounding boxes around every word in the webpage.**
 *    - Wraps words in spans so that their bounding boxes can be used to
 *      determine their positions on the text-rendered-webpage.
 *
 * **5. Collect all text annotations (with positions and dimensions) from each of the candidate elements.**
 *    - Gathers text and positional data for each word.
 *
 * **6. Group annotations by text and deduplicate them based on proximity.**
 *    - There is no guarantee that the text annotations are unique (candidate elements can be nested).
 *    - Thus, we must remove duplicate words that are close to each other on the page.
 *
 * **7. Restore the original DOM after mutations.**
 *    - Returns the DOM to its original state after processing.
 *
 * **8. Format the deduplicated annotations into a text representation.**
 *    - Prepares the text data for the extraction process.
 *
 * **9. Pass the formatted text to an LLM for extraction according to the given instruction and schema.**
 *    - Uses a language model to extract structured data based on instructions.
 *
 * **10. Handle the extraction response and logging the results.**
 *     - Processes the output from the LLM and logs relevant information.
 *
 *
 * Here is what `domExtract` does at a high level:
 *
 * **1. Wait for the DOM to settle and start DOM debugging.**
 *   - Ensures the page is fully loaded and stable before extraction.
 *
 * **2. Process the DOM in chunks.**
 *   - The `processDom` function:
 *     - Divides the page into vertical "chunks" based on viewport height.
 *     - Picks the next chunk that hasn't been processed yet.
 *     - Scrolls to that chunk and extracts candidate elements.
 *     - Returns `outputString` (HTML snippets of candidate elements),
 *       `selectorMap` (the XPaths of the candidate elements),
 *       `chunk` (the current chunk index), and `chunks` (the array of all chunk indices).
 *   - This chunk-based approach ensures that large or lengthy pages can be processed in smaller, manageable sections.
 *
 * **3. Pass the extracted DOM elements (in `outputString`) to the LLM for structured data extraction.**
 *   - Uses the instructions, schema, and previously extracted content as context to
 *     guide the LLM in extracting the structured data.
 *
 * **4. Check if extraction is complete.**
 *    - If the extraction is complete (all chunks have been processed or the LLM determines
 *      that we do not need to continue), return the final result.
 *    - If not, repeat steps 1-4 with the next chunk until extraction is complete or no more chunks remain.
 *
 * @remarks
 * Each step corresponds to specific code segments, as noted in the comments throughout the code.
 */

export class StagehandExtractHandler {
  private readonly stagehand: Stagehand;
  private readonly stagehandPage: StagehandPage;
  private readonly logger: (logLine: LogLine) => void;
  private readonly userProvidedInstructions?: string;

  constructor({
    stagehand,
    logger,
    stagehandPage,
    userProvidedInstructions,
  }: {
    stagehand: Stagehand;
    logger: (message: {
      category?: string;
      message: string;
      level?: number;
      auxiliary?: { [key: string]: { value: string; type: string } };
    }) => void;
    stagehandPage: StagehandPage;
    userProvidedInstructions?: string;
  }) {
    this.stagehand = stagehand;
    this.logger = logger;
    this.stagehandPage = stagehandPage;
    this.userProvidedInstructions = userProvidedInstructions;
  }

  public async extract<T extends z.AnyZodObject>({
    instruction,
    schema,
    content = {},
    chunksSeen = [],
    llmClient,
    requestId,
    domSettleTimeoutMs,
    useTextExtract = false,
    observation,
  }: {
    instruction: string;
    schema: T;
    content?: z.infer<T>;
    chunksSeen?: Array<number>;
    llmClient: LLMClient;
    requestId?: string;
    domSettleTimeoutMs?: number;
    useTextExtract?: boolean;
    observation?: ObserveResult;
  }): Promise<z.infer<T>> {
    if (useTextExtract) {
      return this.textExtract({
        instruction,
        schema,
        content,
        llmClient,
        requestId,
        domSettleTimeoutMs,
        observation,
      });
    } else {
      return this.domExtract({
        instruction,
        schema,
        content,
        chunksSeen,
        llmClient,
        requestId,
        domSettleTimeoutMs,
      });
    }
  }

  private async textExtract<T extends z.AnyZodObject>({
    instruction,
    schema,
    content = {},
    llmClient,
    requestId,
    domSettleTimeoutMs,
    observation,
  }: {
    instruction: string;
    schema: T;
    content?: z.infer<T>;
    llmClient: LLMClient;
    requestId?: string;
    domSettleTimeoutMs?: number;
    observation?: ObserveResult;
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

    // **1:** Wait for the DOM to settle and start DOM debugging
    await this.stagehandPage._waitForSettledDom(domSettleTimeoutMs);
    await this.stagehandPage.startDomDebug();

    // **2:** Determine the extraction target (page or element)
    const extractionTarget = this.getExtractionTarget(observation);

    // **3:** Store the original target element before any mutations
    // we need to store the original DOM here because calling createTextBoundingBoxes()
    // will mutate the DOM by adding spans around every word
    const storedTarget = await this.storeTarget(extractionTarget);

    // 4) Process the target element
    const { selectorMap } = await this.processTarget(extractionTarget);

    // 5) Create bounding boxes in the chosen target
    await this.createTextBoundingBoxesTarget(extractionTarget);

    // 6) Get the width/height for the chosen target
    const {
      width,
      height,
      offsetLeft = 0,
      offsetTop = 0,
    } = await this.getTargetDimensions(extractionTarget);

    // 7) Collect bounding boxes from the candidate elements,
    //    passing offsets so we can subtract them later
    const allAnnotations = await this.collectAllAnnotations(
      selectorMap,
      width,
      height,
      offsetLeft,
      offsetTop,
    );

    // 8) Deduplicate
    const deduplicatedAnnotations = this.deduplicateAnnotations(allAnnotations);

    // 9) Restore the DOM or the element
    await this.restoreTarget(extractionTarget, storedTarget);

    // 10) Format the deduplicated annotations
    const formattedText = formatText(deduplicatedAnnotations, width);
    fs.writeFileSync("formattedText.txt", formattedText);

    // 11) Pass the formatted text to the LLM
    const extractionResponse = await extract({
      instruction,
      previouslyExtractedContent: content,
      domElements: formattedText,
      schema,
      chunksSeen: 1,
      chunksTotal: 1,
      llmClient,
      requestId,
      userProvidedInstructions: this.userProvidedInstructions,
      logger: this.logger,
    });

    const {
      metadata: { completed },
      ...output
    } = extractionResponse;

    // Clean up debug
    await this.stagehandPage.cleanupDomDebug();

    // Handle results
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
        auxiliary: {
          extraction_response: {
            value: JSON.stringify(extractionResponse),
            type: "object",
          },
        },
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

  private async domExtract<T extends z.AnyZodObject>({
    instruction,
    schema,
    content = {},
    chunksSeen = [],
    llmClient,
    requestId,
    domSettleTimeoutMs,
  }: {
    instruction: string;
    schema: T;
    content?: z.infer<T>;
    chunksSeen?: Array<number>;
    llmClient: LLMClient;
    requestId?: string;
    domSettleTimeoutMs?: number;
  }): Promise<z.infer<T>> {
    this.logger({
      category: "extraction",
      message: "starting extraction using old approach",
      level: 1,
      auxiliary: {
        instruction: {
          value: instruction,
          type: "string",
        },
      },
    });

    // **1:** Wait for the DOM to settle and start DOM debugging
    // This ensures the page is stable before extracting any data.
    await this.stagehandPage._waitForSettledDom(domSettleTimeoutMs);
    await this.stagehandPage.startDomDebug();

    // **2:** Call processDom() to handle chunk-based extraction
    // processDom determines which chunk of the page to process next.
    // It will:
    //   - Identify all chunks (vertical segments of the page),
    //   - Pick the next unprocessed chunk,
    //   - Scroll to that chunk's region,
    //   - Extract candidate elements and their text,
    //   - Return the extracted text (outputString), a selectorMap (for referencing elements),
    //     the current chunk index, and the full list of chunks.
    const { outputString, chunk, chunks } = await this.stagehand.page.evaluate(
      (chunksSeen?: number[]) => window.processDom(chunksSeen ?? []),
      chunksSeen,
    );

    this.logger({
      category: "extraction",
      message: "received output from processDom.",
      auxiliary: {
        chunk: {
          value: chunk.toString(),
          type: "integer",
        },
        chunks_left: {
          value: (chunks.length - chunksSeen.length).toString(),
          type: "integer",
        },
        chunks_total: {
          value: chunks.length.toString(),
          type: "integer",
        },
      },
    });

    // **3:** Pass the list of candidate HTML snippets to the LLM
    // The LLM uses the provided instruction and schema to parse and extract
    // structured data.
    const extractionResponse = await extract({
      instruction,
      previouslyExtractedContent: content,
      domElements: outputString,
      schema,
      llmClient,
      chunksSeen: chunksSeen.length,
      chunksTotal: chunks.length,
      requestId,
      isUsingTextExtract: false,
      userProvidedInstructions: this.userProvidedInstructions,
      logger: this.logger,
    });

    const {
      metadata: { completed },
      ...output
    } = extractionResponse;

    await this.stagehandPage.cleanupDomDebug();

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

    // Mark the current chunk as processed by adding it to chunksSeen
    chunksSeen.push(chunk);

    // **4:** Check if extraction is complete
    // If the LLM deems the extraction complete or we've processed all chunks, return the final result.
    // Otherwise, call domExtract again for the next chunk.
    if (completed || chunksSeen.length === chunks.length) {
      this.logger({
        category: "extraction",
        message: "got response",
        auxiliary: {
          extraction_response: {
            value: JSON.stringify(extractionResponse),
            type: "object",
          },
        },
      });

      return output;
    } else {
      this.logger({
        category: "extraction",
        message: "continuing extraction",
        auxiliary: {
          extraction_response: {
            value: JSON.stringify(extractionResponse),
            type: "object",
          },
        },
      });
      await this.stagehandPage._waitForSettledDom(domSettleTimeoutMs);

      // Recursively continue with the next chunk
      return this.domExtract({
        instruction,
        schema,
        content: output,
        chunksSeen,
        llmClient,
        domSettleTimeoutMs,
      });
    }
  }

  /**
   * Based on whether we have an `observation` with an xpath, decide
   * if we’ll extract from the page or from a single element.
   */
  private getExtractionTarget(observation?: ObserveResult): ExtractionTarget {
    if (observation?.selector) {
      const xpath = observation.selector.replace(/^xpath=/, "");
      return { scope: "element", xpath: xpath };
    }
    return { scope: "page" };
  }

  private async processTarget(
    target: ExtractionTarget,
  ): Promise<{ selectorMap: Record<number, string[]> }> {
    if (target.scope === "page") {
      return this.stagehand.page.evaluate(() => window.processAllOfDom());
    } else {
      // pass the xpath to processAllOfDom
      return this.stagehand.page.evaluate((xp) => {
        return window.processAllOfDom(xp);
      }, target.xpath);
    }
  }

  private async createTextBoundingBoxesTarget(
    target: ExtractionTarget,
  ): Promise<void> {
    if (target.scope === "page") {
      await this.stagehand.page.evaluate(() =>
        window.createTextBoundingBoxes(),
      );
    } else {
      await this.stagehand.page.evaluate((xp) => {
        return window.createTextBoundingBoxes(xp);
      }, target.xpath);
    }
  }

  private async getTargetDimensions(target: ExtractionTarget): Promise<{
    width: number;
    height: number;
    offsetLeft?: number;
    offsetTop?: number;
  }> {
    if (target.scope === "page") {
      // Page scope
      const { innerWidth, innerHeight } = await this.stagehand.page.evaluate(
        () => {
          console.log("taking the width of the page from inside the browser");
          return {
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
          };
        },
      );

      console.log("[Node] Window width: ", innerWidth);
      console.log("[Node] Window height: ", innerHeight);

      // For page scope, offsetLeft/offsetTop are zero or undefined
      return { width: innerWidth, height: innerHeight };
    } else {
      // Element scope
      const { elemWidth, elemHeight, offsetLeft, offsetTop, logs } =
        await this.stagehand.page.evaluate((xp) => {
          const el = document.evaluate(
            xp,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
          ).singleNodeValue as HTMLElement | null;

          const logs: string[] = [];

          if (!el) {
            logs.push(
              "No element found, default to window.innerWidth & innerHeight",
            );
            return {
              elemWidth: window.innerWidth,
              elemHeight: window.innerHeight,
              offsetLeft: 0,
              offsetTop: 0,
              logs,
            };
          }

          const rect = el.getBoundingClientRect();
          logs.push(
            `Found element. width=${rect.width}, height=${rect.height}`,
          );
          logs.push(`Window width (in browser) = ${window.innerWidth}`);

          // Also log in the browser console for debugging
          console.log("[Browser] Found element at xpath =>", xp);
          console.log("[Browser] rect =>", rect);

          return {
            elemWidth: rect.width,
            elemHeight: rect.height,
            // We'll return the rect's left/top for local coordinate calculations
            offsetLeft: rect.left,
            offsetTop: rect.top,
            logs,
          };
        }, target.xpath);

      // Log the returned messages in Node
      logs.forEach((msg) => console.log("[Node] " + msg));
      console.log("[Node] final element width =>", elemWidth);
      console.log(
        "[Node] offsetLeft =>",
        offsetLeft,
        " offsetTop =>",
        offsetTop,
      );

      return {
        width: elemWidth,
        height: elemHeight,
        offsetLeft,
        offsetTop,
      };
    }
  }

  private async collectAllAnnotations(
    selectorMap: Record<number, string[]>,
    containerWidth: number,
    containerHeight: number,
    offsetLeft: number,
    offsetTop: number,
  ): Promise<TextAnnotation[]> {
    const allAnnotations: TextAnnotation[] = [];

    // Loop over the candidate XPaths
    for (const xpaths of Object.values(selectorMap)) {
      const xpath = xpaths[0];

      // Evaluate in the browser to get bounding boxes
      const boundingBoxes: Array<{
        text: string;
        left: number;
        top: number;
        width: number;
        height: number;
      }> = await this.stagehandPage.page.evaluate(
        (xp) => window.getElementBoundingBoxes(xp),
        xpath,
      );

      for (const box of boundingBoxes) {
        // 1. Subtract container offsets to get local coordinates
        const localLeft = box.left - offsetLeft;
        const localTop = box.top - offsetTop;

        // 2. bottom_left is local x, plus local y + height
        //    so the baseline is at the bottom edge of the box
        const bottom_left = { x: localLeft, y: localTop + box.height };

        // 3. Normalize by dividing local positions by container width/height
        const bottom_left_normalized = {
          x: localLeft / containerWidth,
          y: (localTop + box.height) / containerHeight,
        };

        if (box.text.trim().length > 0) {
          allAnnotations.push({
            text: box.text,
            bottom_left,
            bottom_left_normalized,
            width: box.width,
            height: box.height,
          });
        }
      }
    }

    return allAnnotations;
  }

  private deduplicateAnnotations(
    allAnnotations: TextAnnotation[],
  ): TextAnnotation[] {
    const annotationsGroupedByText = new Map<string, TextAnnotation[]>();
    for (const ann of allAnnotations) {
      if (!annotationsGroupedByText.has(ann.text)) {
        annotationsGroupedByText.set(ann.text, []);
      }
      annotationsGroupedByText.get(ann.text)!.push(ann);
    }

    const deduplicated: TextAnnotation[] = [];
    for (const [text, group] of annotationsGroupedByText) {
      for (const ann of group) {
        const isDuplicate = deduplicated.some((existing) => {
          if (existing.text !== text) return false;
          const dx = existing.bottom_left.x - ann.bottom_left.x;
          const dy = existing.bottom_left.y - ann.bottom_left.y;
          const distance = Math.hypot(dx, dy);
          return distance < PROXIMITY_THRESHOLD;
        });
        if (!isDuplicate) {
          deduplicated.push(ann);
        }
      }
    }

    return deduplicated;
  }

  private async storeTarget(target: ExtractionTarget): Promise<string> {
    // We call `storeDOM` in the browser context:
    if (target.scope === "page") {
      return await this.stagehandPage.page.evaluate(() => {
        // No XPath passed -> store entire DOM
        return window.storeDOM();
      });
    } else {
      return await this.stagehandPage.page.evaluate((xp) => {
        // Pass in the xpath -> store element
        return window.storeDOM(xp);
      }, target.xpath);
    }
  }

  private async restoreTarget(
    target: ExtractionTarget,
    storedHTML: string,
  ): Promise<void> {
    // We call `restoreDOM` in the browser context:
    if (target.scope === "page") {
      return await this.stagehandPage.page.evaluate((html) => {
        // No XPath passed -> restore entire DOM
        window.restoreDOM(html);
      }, storedHTML);
    } else {
      return await this.stagehandPage.page.evaluate(
        ({ xp, dom }) => {
          // Pass in the xpath -> restore element
          window.restoreDOM(dom, xp);
        },
        { xp: target.xpath, dom: storedHTML },
      );
    }
  }
}
