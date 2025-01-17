import { initStagehand } from "../initStagehand";
import { EvalFunction } from "../../types/evals";

export const observe_shopify: EvalFunction = async ({
  modelName,
  logger,
  useAccessibilityTree,
}) => {
  const { stagehand, initResponse } = await initStagehand({
    modelName,
    logger,
  });

  const { debugUrl, sessionUrl } = initResponse;
  const cdpClient = await stagehand.page
    .context()
    .newCDPSession(stagehand.page);

  await stagehand.page.goto("https://www.shopify.com/");

  const observations = await stagehand.page.observe({
    instruction: "find all the links to social media platforms",
    useAccessibilityTree: useAccessibilityTree,
  });

  if (observations.length === 0 || observations.length < 7) {
    await stagehand.close();
    return {
      _success: false,
      observations,
      debugUrl,
      sessionUrl,
      logs: logger.getLogs(),
    };
  }

  let foundMatches = true;
  const expectedLocator = `body > div.relative > header > div > div > div.ml-auto > ul.lg\\:flex.hidden.items-center > li.leading-\\[0\\] > a`;

  if (useAccessibilityTree) {
    for (const observation of observations) {
      const { node } = await cdpClient.send("DOM.describeNode", {
        backendNodeId: parseInt(observation.selector),
        depth: -1,
        pierce: true,
      });

      // Check if the node is a link in the navigation
      if (node.nodeName !== "A") {
        foundMatches = false;
        break;
      }
    }
  } else {
    const expectedResult = await stagehand.page
      .locator(expectedLocator)
      .first()
      .innerText();

    let foundMatch = false;
    for (const observation of observations) {
      try {
        const observationResult = await stagehand.page
          .locator(observation.selector)
          .first()
          .innerText();

        if (observationResult === expectedResult) {
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
    foundMatches = foundMatch;
  }

  await stagehand.close();

  return {
    _success: foundMatches,
    observations,
    debugUrl,
    sessionUrl,
    logs: logger.getLogs(),
  };
};
