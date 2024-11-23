import { EvalLogger } from "../utils";
import { Stagehand } from "../../lib";
import type { AvailableModel } from "../../lib/llm/LLMProvider";
import { LogLine } from "../../lib/types";

export const peeler_simple = async ({
  modelName,
}: {
  modelName: AvailableModel;
}) => {
  const logger = new EvalLogger();

  const stagehand = new Stagehand({
    env: "LOCAL",
    headless: process.env.HEADLESS !== "false",
    logger: (logLine: LogLine) => {
      logger.log(logLine);
    },
    verbose: 2,
    enableCaching,
  });

  logger.init(stagehand);

  const { debugUrl, sessionUrl } = await stagehand.init({ modelName });

  await stagehand.page.goto(`file://${process.cwd()}/evals/assets/peeler.html`);

  await stagehand.act({ action: "add the peeler to cart" });

  const successMessageLocator = stagehand.page.locator(
    'text="Congratulations, you have 1 A in your cart"',
  );
  const isVisible = await successMessageLocator.isVisible();

  await stagehand.context.close();
  return {
    _success: isVisible,
    debugUrl,
    sessionUrl,
    logs: logger.getLogs(),
  };
};
