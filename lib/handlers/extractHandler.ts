import { Stagehand } from "../index";
import { AvailableModel, LLMProvider } from "../llm/LLMProvider";
import { extract } from "../inference";
import { z } from "zod";

export class StagehandExtractHandler {
  private readonly stagehand: Stagehand;
  private readonly llmProvider: LLMProvider;
  private readonly defaultModelName: AvailableModel;
  private readonly logger: (log: {
    category: string;
    message: string;
    level: 0 | 1 | 2;
  }) => void;
  private readonly waitForSettledDom: (
    domSettleTimeoutMs?: number,
  ) => Promise<void>;
  private readonly startDomDebug: () => Promise<void>;
  private readonly cleanupDomDebug: () => Promise<void>;

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
    logger: (log: {
      category: string;
      message: string;
      level: 0 | 1 | 2;
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
  }

  public async extract<T extends z.AnyZodObject>({
    instruction,
    schema,
    progress = "",
    content = {},
    chunksSeen = [],
    modelName,
    requestId,
    domSettleTimeoutMs,
  }: {
    instruction: string;
    schema: T;
    progress?: string;
    content?: z.infer<T>;
    chunksSeen?: Array<number>;
    modelName?: AvailableModel;
    requestId?: string;
    domSettleTimeoutMs?: number;
  }): Promise<z.infer<T>> {
    this.logger({
      category: "extraction",
      message: `starting extraction '${instruction}'`,
      level: 1,
    });

    await this.waitForSettledDom(domSettleTimeoutMs);
    await this.startDomDebug();
    const { outputString, chunk, chunks } = await this.stagehand.page.evaluate(
      (chunksSeen?: number[]) => window.processDom(chunksSeen ?? []),
      chunksSeen,
    );

    this.logger({
      category: "extraction",
      message: `received output from processDom. Current chunk index: ${chunk}, Number of chunks left: ${chunks.length - chunksSeen.length}`,
      level: 1,
    });

    const extractionResponse = await extract({
      instruction,
      progress,
      previouslyExtractedContent: content,
      domElements: outputString,
      llmProvider: this.llmProvider,
      schema,
      modelName: modelName || this.defaultModelName,
      chunksSeen: chunksSeen.length,
      chunksTotal: chunks.length,
      requestId,
    });

    const {
      metadata: { progress: newProgress, completed },
      ...output
    } = extractionResponse;
    await this.cleanupDomDebug();

    this.logger({
      category: "extraction",
      message: `received extraction response: ${JSON.stringify(extractionResponse)}`,
      level: 1,
    });

    chunksSeen.push(chunk);

    if (completed || chunksSeen.length === chunks.length) {
      this.logger({
        category: "extraction",
        message: `response: ${JSON.stringify(extractionResponse)}`,
        level: 1,
      });

      return output;
    } else {
      this.logger({
        category: "extraction",
        message: `continuing extraction, progress: '${newProgress}'`,
        level: 1,
      });
      await this.waitForSettledDom(domSettleTimeoutMs);
      return this.extract({
        instruction,
        schema,
        progress: newProgress,
        content: output,
        chunksSeen,
        modelName,
        domSettleTimeoutMs,
      });
    }
  }
}
