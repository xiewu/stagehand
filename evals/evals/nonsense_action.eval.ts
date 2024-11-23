import { Eval, EvalLogger, TestConfig } from "../utils";
import { Stagehand } from "../../lib";
import { LogLine } from "../../lib/types";

// Validate that the action is not found on the page
export const nonsense_action: Eval = async ({
  modelName,
  enableCaching,
  env,
}: TestConfig) => {
  const logger = new EvalLogger();

  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 2,
    debugDom: true,
    headless: true,
    logger: (logLine: LogLine) => {
      logger.log(logLine);
    },
    enableCaching,
  });

  logger.init(stagehand);

  const { debugUrl, sessionUrl } = await stagehand.init({ modelName });

  try {
    await stagehand.page.goto("https://www.homedepot.com/");

    const result = await stagehand.act({
      action: "click on the first banana",
    });
    console.log("result", result);

    // Assert the output
    const expectedResult = {
      success: false,
      message:
        "Action not found on the current page after checking all chunks.",
      action: "click on the first banana",
    };

    const isResultCorrect =
      JSON.stringify(result) === JSON.stringify(expectedResult);

    return {
      _success: isResultCorrect,
      debugUrl,
      sessionUrl,
      logs: logger.getLogs(),
    };
  } catch (error) {
    console.error(`Error in nonsense_action function: ${error.message}`);
    return {
      _success: false,
      error: JSON.parse(JSON.stringify(error, null, 2)),
      debugUrl,
      sessionUrl,
      logs: logger.getLogs(),
    };
  } finally {
    await stagehand.context.close();
  }
};
