import { LLMProvider } from "../llm/LLMProvider";
import { Stagehand } from "../index";
import { z } from "zod";
import { LogLine } from "../../types/log";
import { TextAnnotation } from "../../types/textannotation";
import { extract } from "../inference";
import { LLMClient } from "../llm/LLMClient";
import { formatText } from "../utils";

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
    chunksSeen = [],
    llmClient,
    requestId,
    domSettleTimeoutMs,
    useTextExtract = false,
  }: {
    instruction: string;
    schema: T;
    content?: z.infer<T>;
    chunksSeen?: Array<number>;
    llmClient: LLMClient;
    requestId?: string;
    domSettleTimeoutMs?: number;
    useTextExtract?: boolean;
  }): Promise<z.infer<T>> {
    if (useTextExtract) {
      return this.textExtract({
        instruction,
        schema,
        content,
        llmClient,
        requestId,
        domSettleTimeoutMs,
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
      message: "starting extraction using text approach",
      level: 1,
      auxiliary: {
        instruction: {
          value: instruction,
          type: "string",
        },
      },
    });

    // **1:** Wait for the DOM to settle and start DOM debugging
    await this.waitForSettledDom(domSettleTimeoutMs);
    await this.startDomDebug();

    // **2:** Store the original DOM before any mutations
    const originalDOM = await this.stagehand.page.evaluate(() => {
      return (window as any).storeDOM();
    });

    // **3:** Get selector map for candidate elements
    const { selectorMap } = (await this.stagehand.page.evaluate(() => {
      return (window as any).processAllOfDom();
    })) as { selectorMap: Record<number, string[]> };

    // **4:** Get page dimensions for chunking
    const pageWidth = await this.stagehand.page.evaluate(
      () => window.innerWidth,
    );
    const pageHeight = await this.stagehand.page.evaluate(
      () => window.innerHeight,
    );

    // **5:** Process page in vertical chunks
    const CHUNK_HEIGHT = Math.floor(pageHeight / 2); // Process half page at a time
    const numChunks = Math.ceil(pageHeight / CHUNK_HEIGHT);
    let finalOutput = content;
    let completed = false;

    for (
      let chunkIndex = 0;
      chunkIndex < numChunks && !completed;
      chunkIndex++
    ) {
      // Calculate chunk boundaries
      const chunkTop = chunkIndex * CHUNK_HEIGHT;
      const chunkBottom = Math.min((chunkIndex + 1) * CHUNK_HEIGHT, pageHeight);

      // **6:** Create text bounding boxes for current chunk
      await this.stagehand.page.evaluate(() => {
        return (window as any).createTextBoundingBoxes();
      });

      // **7:** Collect text annotations for current chunk
      const allAnnotations: TextAnnotation[] = [];
      for (const xpaths of Object.values(selectorMap)) {
        const xpath = xpaths[0];
        const boundingBoxes = await this.stagehand.page.evaluate(
          (xpath: string, top: number, bottom: number) => {
            const boxes = (window as any).getElementBoundingBoxes(
              xpath,
            ) as Array<{
              text: string;
              left: number;
              top: number;
              width: number;
              height: number;
            }>;
            return boxes.filter((box) => box.top >= top && box.top < bottom);
          },
          xpath,
          chunkTop,
          chunkBottom,
        );

        for (const box of boundingBoxes) {
          const bottom_left = {
            x: box.left,
            y: box.top + box.height,
          };
          const bottom_left_normalized = {
            x: box.left / pageWidth,
            y: (box.top + box.height) / pageHeight,
          };

          const annotation: TextAnnotation = {
            text: box.text,
            bottom_left,
            bottom_left_normalized,
            width: box.width,
            height: box.height,
          };
          allAnnotations.push(annotation);
        }
      }

      // **8:** Deduplicate annotations
      const deduplicatedTextAnnotations =
        this.deduplicateAnnotations(allAnnotations);

      // **9:** Format text for current chunk
      const formattedText = formatText(deduplicatedTextAnnotations, pageWidth);

      // **10:** Extract data from current chunk
      const extractionResponse = await extract({
        instruction,
        previouslyExtractedContent: finalOutput,
        domElements: formattedText,
        schema,
        chunksSeen: chunkIndex + 1,
        chunksTotal: numChunks,
        llmClient,
        requestId,
        isUsingTextExtract: true,
      });

      const {
        metadata: { completed: chunkCompleted },
        ...output
      } = extractionResponse;

      completed = chunkCompleted;
      finalOutput = output;

      // **11:** Clean up DOM modifications after each chunk
      await this.stagehand.page.evaluate((dom: string) => {
        return (window as any).restoreDOM(dom);
      }, originalDOM);

      this.logger({
        category: "extraction",
        message: `processed chunk ${chunkIndex + 1}/${numChunks}`,
        auxiliary: {
          chunk_index: {
            value: chunkIndex.toString(),
            type: "integer",
          },
          total_chunks: {
            value: numChunks.toString(),
            type: "integer",
          },
          completed: {
            value: completed.toString(),
            type: "boolean",
          },
        },
      });
    }

    await this.cleanupDomDebug();
    return finalOutput;
  }

  private deduplicateAnnotations(
    allAnnotations: TextAnnotation[],
  ): TextAnnotation[] {
    // Group annotations by text
    const annotationsGroupedByText = new Map<string, TextAnnotation[]>();
    for (const annotation of allAnnotations) {
      if (!annotationsGroupedByText.has(annotation.text)) {
        annotationsGroupedByText.set(annotation.text, []);
      }
      annotationsGroupedByText.get(annotation.text)!.push(annotation);
    }

    const deduplicatedTextAnnotations: TextAnnotation[] = [];

    // Deduplicate annotations per text group
    for (const [text, annotations] of annotationsGroupedByText.entries()) {
      for (const annotation of annotations) {
        const isDuplicate = deduplicatedTextAnnotations.some(
          (existingAnnotation) => {
            if (existingAnnotation.text !== text) return false;
            const dx =
              existingAnnotation.bottom_left.x - annotation.bottom_left.x;
            const dy =
              existingAnnotation.bottom_left.y - annotation.bottom_left.y;
            const distance = Math.hypot(dx, dy);
            return distance < PROXIMITY_THRESHOLD;
          },
        );

        if (!isDuplicate) {
          deduplicatedTextAnnotations.push(annotation);
        }
      }
    }

    return deduplicatedTextAnnotations;
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
    await this.waitForSettledDom(domSettleTimeoutMs);
    await this.startDomDebug();

    // **2:** Call processDom() to handle chunk-based extraction
    const { outputString, chunk, chunks } = (await this.stagehand.page.evaluate(
      (seen: number[]) => (window as any).processDom(seen),
      chunksSeen,
    )) as { outputString: string; chunk: number; chunks: number[] };

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

    // Mark the current chunk as processed by adding it to chunksSeen
    chunksSeen.push(chunk);

    // **4:** Check if extraction is complete
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
      await this.waitForSettledDom(domSettleTimeoutMs);

      // Recursively continue with the next chunk
      return this.domExtract({
        instruction,
        schema,
        content: output,
        chunksSeen,
        llmClient,
        requestId,
        domSettleTimeoutMs,
      });
    }
  }
}
