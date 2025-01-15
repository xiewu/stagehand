import { initStagehand } from "../initStagehand";
import { EvalFunction } from "../../types/evals";

export const panamcs2: EvalFunction = async ({ modelName, logger, useAccessibilityTree }) => {
  const { stagehand, initResponse } = await initStagehand({
    modelName,
    logger,
  });

  const { debugUrl, sessionUrl } = initResponse;
  const cdpClient  = await stagehand.page.context().newCDPSession(stagehand.page);

  await stagehand.page.goto("https://panamcs.org/about/staff/");

  const observations = await stagehand.page.observe({
    instruction: "find all the links for the people in the page",
    useAccessibilityTree: useAccessibilityTree
  });

  if (observations.length === 0 || observations.length < 47) {
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
  const expectedLocator = `a.btn:nth-child(3)`;

  if (useAccessibilityTree) {

    for (const observation of observations) { 
      // const { object } = await cdpClient.send('DOM.resolveNode', { backendNodeId: parseInt(observation.selector) });
      // const { result } = await cdpClient.send('Runtime.callFunctionOn', {
      //   objectId: object.objectId,
      //   functionDeclaration: 'function() { return this.textContent; }',
      // });

      // console.log(result.value);

      const { node } = await cdpClient.send('DOM.describeNode', { 
        backendNodeId: parseInt(observation.selector),
        depth: -1,
        pierce: true
      });
      if (node.nodeName !== 'A') {
        foundMatches = false;
        break;
      }
    }

    // TODO: potentially check by playwright getByRole
    // const locator = stagehand.page.getByRole('link');

    // try {
    //   await locator.click();
    // } catch (error) {
    //   if (error.message.includes('strict mode violation')) {
    //     console.log(error.message.split('Call log:')[0].trim());
    //   }
    // }
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

    await stagehand.close();
  }

  return {
    _success: foundMatches,
    observations,
    debugUrl,
    sessionUrl,
    logs: logger.getLogs(),
  };
};
