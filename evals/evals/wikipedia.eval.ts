import { LogLine } from "../../lib/types";
import { Eval, EvalLogger, TestConfig } from "../utils";
import { Stagehand } from "../../lib";

export const wikipedia: Eval = async ({ modelName, enableCaching, env }) => {
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

  const { debugUrl, sessionUrl } = await stagehand.init({ modelName });

  await stagehand.page.goto(`https://en.wikipedia.org/wiki/Baseball`);
  await stagehand.act({
    action: 'click the "hit and run" link in this article',
  });

  const url = "https://en.wikipedia.org/wiki/Hit_and_run_(baseball)";
  const currentUrl = stagehand.page.url();
  await stagehand.context.close().catch(() => {});

  return {
    _success: currentUrl === url,
    expected: url,
    actual: currentUrl,
    debugUrl,
    sessionUrl,
    logs: logger.getLogs(),
  };
};
