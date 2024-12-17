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

    // Navigate to the initial URL before performing actions
    const initialUrl = task.evaluation[0].content.url;
    await stagehand.page.goto(initialUrl);

    // Execute the web navigation task
    await stagehand.act({
      action: task.task,
    });

    // Validate each step of the navigation
    let allStepsSucceeded = true;
    for (const step of task.evaluation) {
      const currentUrl = stagehand.page.url();

      // Determine validation method based on match_function_name
      const isMatch =
        step.match_function_name === "url_included_match"
          ? validateUrlPath(currentUrl, step.content.reference_answer)
          : validateUrlMatch(currentUrl, step.content.url);

      if (!isMatch) {
        logger.error({
          message: `URL validation failed for step`,
          level: 0,
          auxiliary: {
            currentUrl: {
              value: currentUrl,
              type: "string",
            },
            expectedUrl: {
              value: step.content.url,
              type: "string",
            },
            matchFunction: {
              value: step.match_function_name,
              type: "string",
            },
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
      logs: logger.getLogs(),
      debugUrl,
      sessionUrl,
    };
  } catch (error) {
    logger.error({
      message: `Error in mind2web eval`,
      level: 0,
      auxiliary: {
        error: {
          value: error.message,
          type: "string",
        },
        trace: {
          value: error.stack,
          type: "string",
        },
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
