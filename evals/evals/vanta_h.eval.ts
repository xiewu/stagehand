import { EvalLogger } from "../utils";
import { Stagehand } from "../../lib";
import type { AvailableModel } from "../../lib/llm/LLMProvider";
import { LogLine } from "../../lib/types";

export const vanta_h = async ({ modelName }: { modelName: AvailableModel }) => {
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

  await stagehand.page.goto("https://www.vanta.com/");

  const observations = await stagehand.observe({
    instruction: "find the buy now button",
  });

  await stagehand.context.close();

  // we should have no saved observation since the element shouldn't exist
  return {
    _success: observations.length === 0,
    observations,
    debugUrl,
    sessionUrl,
    logs: logger.getLogs(),
  };
};
