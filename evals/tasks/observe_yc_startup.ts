import { initStagehand } from "@/evals/initStagehand";
import { EvalFunction } from "@/types/evals";

export const observe_yc_startup: EvalFunction = async ({
  modelName,
  logger,
}) => {
  const { stagehand, initResponse } = await initStagehand({
    modelName,
    logger,
  });

  const { debugUrl, sessionUrl } = initResponse;

  await stagehand.page.goto("https://www.ycombinator.com/companies");
  await stagehand.page.waitForLoadState("networkidle");

  const observations = await stagehand.page.observe({
    instruction:
      "Find the container element that holds links to each of the startup companies. The companies each have a name, a description, and a link to their website.",
  });

  console.log("observations", JSON.stringify(observations, null, 2));

  if (observations.length === 0) {
    await stagehand.close();
    return {
      _success: false,
      observations,
      debugUrl,
      sessionUrl,
      logs: logger.getLogs(),
    };
  }

  const expectedLocator = "div._section_1pgsr_163._results_1pgsr_343";

  const expectedResult = await stagehand.page.locator(expectedLocator);

  let foundMatch = false;

  for (const observation of observations) {
    try {
      const observationLocator = stagehand.page
        .locator(observation.selector)
        .first();
      const observationHandle = await observationLocator.elementHandle();
      const expectedHandle = await expectedResult.elementHandle();

      if (!observationHandle || !expectedHandle) {
        // Couldn’t get handles, skip
        continue;
      }

      const isSameNode = await observationHandle.evaluate(
        (node, otherNode) => node === otherNode,
        expectedHandle,
      );

      if (isSameNode) {
        foundMatch = true;
        break;
      }
    } catch (error) {
      console.warn(
        `Failed to check observation with selector ${observation.selector}:`,
        error.message,
      );
      continue;
    }
  }

  await stagehand.close();

  return {
    _success: foundMatch,
    expected: expectedResult,
    observations,
    debugUrl,
    sessionUrl,
    logs: logger.getLogs(),
  };
};
