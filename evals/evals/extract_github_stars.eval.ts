import { EvalLogger } from "../utils";
import { Stagehand } from "../../lib";
import { LogLine } from "../../lib/types";
import { Eval, TestConfig } from "../utils";
import { z } from "zod";
export const extract_github_stars: Eval = async ({
  modelName,
  enableCaching,
  env,
}: TestConfig) => {
  const logger = new EvalLogger();

  const stagehand = new Stagehand({
    env,
    verbose: 2,
    headless: process.env.HEADLESS !== "false",
    logger: (logLine: LogLine) => {
      logger.log(logLine);
    },
    enableCaching,
  });

  logger.init(stagehand);

  const { debugUrl, sessionUrl } = await stagehand.init();

  try {
    await stagehand.page.goto("https://github.com/facebook/react");

    const { stars } = await stagehand.extract({
      instruction: "Extract the number of stars for the project",
      schema: z.object({
        stars: z.number().describe("the number of stars for the project"),
      }),
      modelName,
    });

    const expectedStarsString = await stagehand.page
      .locator("#repo-stars-counter-star")
      .first()
      .innerHTML();

    const expectedStars = expectedStarsString.toLowerCase().endsWith("k")
      ? parseFloat(expectedStarsString.slice(0, -1)) * 1000
      : parseFloat(expectedStarsString);

    await stagehand.context.close().catch(() => {});
    return {
      _success: stars === expectedStars,
      stars,
      debugUrl,
      sessionUrl,
      logs: logger.getLogs(),
    };
  } catch (error) {
    console.error("Error or timeout occurred:", error);
    await stagehand.context.close().catch(() => {});
    return {
      _success: false,
      error: JSON.parse(JSON.stringify(error, null, 2)),
      debugUrl,
      sessionUrl,
      logs: logger.getLogs(),
    };
  }
};
