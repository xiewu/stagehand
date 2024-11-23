import { EvalLogger } from "../utils";
import { Stagehand } from "../../lib";
import type { AvailableModel } from "../../lib/llm/LLMProvider";
import { LogLine } from "../../lib/types";

export const simple_google_search = async ({
  modelName,
}: {
  modelName: AvailableModel;
}) => {
  const logger = new EvalLogger();

  const stagehand = new Stagehand({
    env,
    headless: process.env.HEADLESS !== "false",
    logger: (logLine: LogLine) => {
      logger.log(logLine);
    },
    verbose: 2,
    enableCaching,
  });

  logger.init(stagehand);

  const { debugUrl, sessionUrl } = await stagehand.init({ modelName });

  await stagehand.page.goto("https://www.google.com");

  await stagehand.act({
    action: 'Search for "OpenAI"',
  });

  const expectedUrl = "https://www.google.com/search?q=OpenAI";
  const currentUrl = stagehand.page.url();

  await stagehand.context.close();

  return {
    _success: currentUrl.startsWith(expectedUrl),
    currentUrl,
    debugUrl,
    sessionUrl,
    logs: logger.getLogs(),
  };
};
