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
  let success = false;
  let currentStepIndex = 0;
  let totalSteps = 0;
  let taskData = null;

  try {
    // Load a task from the dataset
    const tasks = await loadMind2WebDataset();
    const task = tasks[0]; // Start with first task for testing
    taskData = task;
    totalSteps = task.evaluation.length;

    // Track success for each navigation step
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

        // Wait for any navigation to complete
        await stagehand.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
          // Ignore timeout errors for network idle
          logger.warn({
            message: 'Network idle timeout reached',
            level: 1,
            auxiliary: {
              step: { value: JSON.stringify(step), type: "string" },
            },
          });
        });

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

    success = allStepsSucceeded;
  } catch (error) {
    logger.error({
      message: `Error in mind2web eval`,
      level: 0,
      auxiliary: {
        error: { value: error.message, type: "string" },
        trace: { value: error.stack, type: "string" },
      },
    });
    success = false;
  } finally {
    // Ensure browser is properly closed
    try {
      await stagehand.close();
    } catch (closeError) {
      logger.warn({
        message: 'Error while closing stagehand',
        level: 1,
        auxiliary: {
          error: { value: closeError.message, type: "string" },
        },
      });
    }

    return {
      _success: success,
      task: taskData?.task,
      stepsCompleted: currentStepIndex,
      totalSteps,
      logs: logger.getLogs(),
      debugUrl,
      sessionUrl,
    };
  }
};
