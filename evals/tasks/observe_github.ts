import { initStagehand } from "@/evals/initStagehand";
import { EvalFunction } from "@/types/evals";

export const observe_github: EvalFunction = async ({
  modelName,
  logger,
  useAccessibilityTree,
}) => {
  const { stagehand, initResponse } = await initStagehand({
    modelName,
    logger,
  });

  const { debugUrl, sessionUrl } = initResponse;

  await stagehand.page.goto(
    "https://github.com/browserbase/stagehand/tree/main/lib",
  );

  const observations = await stagehand.page.observe({
    instruction: "find the scrollable element that holds the repos file tree",
    useAccessibilityTree,
  });

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

  const expectedLocator = `#repos-file-tree > div.Box-sc-g0xbh4-0.jbQqON > div > div > div > nav > ul`;

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
