import { EvalFunction } from "../../types/evals";
import { initStagehand } from "../utils";
import { loadMind2WebDataset } from "../datasets/mind2web";
import { validateUrlPath, validateUrlMatch } from "../utils/url_validation";

export const mind2web: EvalFunction = async ({ modelName, logger }) => {
  const { stagehand, initResponse } = await initStagehand({
    modelName,
    logger,
  });

  const { debugUrl, sessionUrl } = initResponse;

  try {
    // Load a task from the dataset
    const tasks = await loadMind2WebDataset();
    const task = tasks[0]; // Start with first task for testing

    // Track success for each navigation step
    let currentStepIndex = 0;
    const totalSteps = task.evaluation.length;
    let allStepsSucceeded = true;

    // Navigate to the initial URL before performing actions
    const initialUrl = task.evaluation[0].content.url;
    await stagehand.page.goto(initialUrl);

    // Process each navigation step with timeout
    for (const step of task.evaluation) {
      // Skip first step since we already navigated there
      if (currentStepIndex === 0) {
        currentStepIndex++;
        continue;
      }

      try {
        // Set a timeout for each action
        const actionPromise = stagehand.act({
          action: `Navigate to find ${step.content.reference_answer}`,
        });

        // Wait for action with timeout
        await Promise.race([
          actionPromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Action timeout after 35 seconds')), 35000)
          ),
        ]);

        // Validate the navigation result
        const currentUrl = stagehand.page.url();
        const isMatch = step.match_function_name === "url_included_match"
          ? validateUrlPath(currentUrl, step.content.reference_answer)
          : validateUrlMatch(currentUrl, step.content.url);

        if (!isMatch) {
          logger.error({
            message: `URL validation failed for step ${currentStepIndex}`,
            level: 0,
            auxiliary: {
              currentUrl: { value: currentUrl, type: "string" },
              expectedUrl: { value: step.content.url, type: "string" },
              matchFunction: { value: step.match_function_name, type: "string" },
            },
          });
          allStepsSucceeded = false;
          break;
        }

        currentStepIndex++;
      } catch (stepError) {
        logger.error({
          message: `Error in step ${currentStepIndex}`,
          level: 0,
          auxiliary: {
            error: { value: stepError.message, type: "string" },
            step: { value: JSON.stringify(step), type: "string" },
          },
        });
        allStepsSucceeded = false;
        break;
      }
    }

    await stagehand.close();

    return {
      _success: allStepsSucceeded,
      task: task.task,
      stepsCompleted: currentStepIndex,
      totalSteps,
      logs: logger.getLogs(),
      debugUrl,
      sessionUrl,
    };
  } catch (error) {
    logger.error({
      message: `Error in mind2web eval`,
      level: 0,
      auxiliary: {
        error: { value: error.message, type: "string" },
        trace: { value: error.stack, type: "string" },
      },
    });

    await stagehand.close();

    return {
      _success: false,
      error,
      logs: logger.getLogs(),
      debugUrl,
      sessionUrl,
    };
  }
};
