import { Eval, EvalLogger, TestConfig } from "../utils";
import { Stagehand } from "../../lib";
import type { AvailableModel } from "../../lib/llm/LLMProvider";
import { LogLine } from "../../lib/types";
import { z } from "zod";

export const costar: Eval = async ({
  modelName,
  enableCaching,
  env,
}: TestConfig) => {
  const logger = new EvalLogger();

  const stagehand = new Stagehand({
    env,
    verbose: 2,
    debugDom: true,
    headless: process.env.HEADLESS !== "false",
    logger: (logLine: LogLine) => {
      logger.log(logLine);
    },
    enableCaching,
  });

  logger.init(stagehand);

  const { debugUrl, sessionUrl } = await stagehand.init({ modelName });
  // TODO: fix this eval - does not work in headless mode
  try {
    await Promise.race([
      stagehand.page.goto("https://www.costar.com/"),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Navigation timeout")), 30000),
      ),
    ]);

    await stagehand.act({ action: "click on the first article" });

    await stagehand.act({
      action: "click on the learn more button for the first job",
    });

    const articleTitle = await stagehand.extract({
      instruction: "extract the title of the article",
      schema: z.object({
        title: z.string().describe("the title of the article").nullable(),
      }),
      modelName: "gpt-4o-2024-08-06",
    });

    logger.log({
      message: "got article title",
      level: 1,
      auxiliary: {
        articleTitle: {
          value: JSON.stringify(articleTitle),
          type: "object",
        },
      },
    });

    // Check if the title is more than 5 characters
    const isTitleValid =
      articleTitle.title !== null && articleTitle.title.length > 5;

    await stagehand.context.close();

    return {
      title: articleTitle.title,
      _success: isTitleValid,
      debugUrl,
      sessionUrl,
      logs: logger.getLogs(),
    };
  } catch (error) {
    logger.error({
      message: "error in costar function",
      level: 0,
      auxiliary: {
        error: {
          value: error.message,
          type: "string",
        },
        trace: {
          value: error.stack,
          type: "string",
        },
      },
    });
    return {
      title: null,
      _success: false,
      debugUrl,
      sessionUrl,
      logs: logger.getLogs(),
    };
  } finally {
    await stagehand.context.close();
  }
};
