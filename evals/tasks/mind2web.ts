import { z } from "zod";
import { EvalFunction } from "../../types/evals";
import { Stagehand } from "../../lib";
import { InitResult } from "../../types/stagehand";
import { LogLine } from "../../types/log";
import { loadMind2WebDataset } from "../datasets/mind2web";
import { validateUrlMatch } from "../utils/url_validation";

// Define types for Mind2Web evaluation steps
interface EvaluationStep {
  content: {
    key: string;
    netloc: string | null;
    path: string | null;
    reference_answer: string;
    url: string;
  };
  match_function_name: string;
  method: string | null;
}

// Used in loadMind2WebDataset return type and evaluation loop
export interface TestCase {
  task: string;
  evaluation: EvaluationStep[];
}

interface CategoryScores {
  act: {
    success: number;
    total: number;
    percentage: number;
  };
  extract: {
    success: number;
    total: number;
    percentage: number;
  };
  observe: {
    success: number;
    total: number;
    percentage: number;
  };
}

export const mind2web: EvalFunction = async ({ modelName, logger, useTextExtract }) => {
  const logs: LogLine[] = [];
  let currentStagehand: Stagehand | undefined;
  let initResult: InitResult | undefined;

  // Initialize scores
  const scores: CategoryScores = {
    act: { success: 0, total: 0, percentage: 0 },
    extract: { success: 0, total: 0, percentage: 0 },
    observe: { success: 0, total: 0, percentage: 0 },
  };

  try {
    // Load dataset and take first 5 test cases for initial testing
    const allTestCases = await loadMind2WebDataset();
    const testCases = allTestCases.slice(0, 5);

    // Initialize Stagehand with optimized settings for Mind2Web dataset
    currentStagehand = new Stagehand({
      env: "BROWSERBASE",
      modelName,
      enableCaching: true,
      logger: (line) => logs.push(line),
      browserbaseSessionCreateParams: {
        projectId: process.env.BROWSERBASE_PROJECT_ID || "",
        timeout: 60, // 60 seconds timeout
        browserSettings: {
          fingerprint: {
            httpVersion: "1" as unknown as 1, // Satisfy both TypeScript and runtime requirements
          },
          viewport: {
            width: 1280,
            height: 800,
          },
          logSession: true,
          recordSession: true,
        },
      },
    });

    initResult = await currentStagehand.init();

    for (const [index, testCase] of testCases.entries()) {
      logs.push({
        message: `Processing test case ${index + 1}/${testCases.length}: ${testCase.task}`,
        level: 1,
      });

      try {
        // Initialize state for tracking progress
        let currentUrl = "";
        let retryCount = 0;
        const maxRetries = 3;

        // Process each evaluation step sequentially
        for (const [stepIndex, step] of testCase.evaluation.entries()) {
          try {
            // Navigate to URL if different from current
            if (step.content.url !== currentUrl) {
              await currentStagehand.page.goto(step.content.url, {
                waitUntil: "domcontentloaded",
              });
              currentUrl = step.content.url;
              await currentStagehand.page.waitForLoadState("domcontentloaded");
            }

            // 1. Act: Perform the required action
            const actResult = await currentStagehand.act({
              action: `Find and interact with element containing "${step.content.reference_answer}" to complete task: ${testCase.task}`,
            });

            if (actResult.success) {
              scores.act.success++;
            }
            scores.act.total++;

            // 2. Extract: Get information about the target element
            const extractSchema = z.object({
              elementFound: z.boolean(),
              elementText: z.string(),
              elementType: z.string(),
              currentUrl: z.string(),
            });

            const extractResult = await currentStagehand.extract({
              instruction: `Find and extract information about element containing "${step.content.reference_answer}"`,
              schema: extractSchema,
              useTextExtract,
            });

            const extractSuccess = extractResult.elementFound && (
              extractResult.elementText.toLowerCase().includes(step.content.reference_answer.toLowerCase()) ||
              extractResult.currentUrl.includes(step.content.reference_answer)
            );

            if (extractSuccess) {
              scores.extract.success++;
            }
            scores.extract.total++;

            // 3. Observe: Check page state and available interactions
            const observeResults = await currentStagehand.observe();
            const observeSuccess = observeResults.some(result =>
              result.description.toLowerCase().includes(step.content.reference_answer.toLowerCase())
            );

            if (observeSuccess) {
              scores.observe.success++;
            }
            scores.observe.total++;

            // Log progress for current step
            logger.log({
              message: `Step ${stepIndex + 1}/${testCase.evaluation.length} completed`,
              level: 1,
              auxiliary: {
                scores: {
                  value: JSON.stringify({
                    act: (scores.act.success / scores.act.total) * 100,
                    extract: (scores.extract.success / scores.extract.total) * 100,
                    observe: (scores.observe.success / scores.observe.total) * 100,
                  }),
                  type: "string",
                },
              },
            });

          } catch (stepError) {
            logger.log({
              message: `Error in step ${stepIndex + 1}: ${stepError instanceof Error ? stepError.message : "Unknown error"}`,
              level: 2,
            });

            // Count failed attempts
            scores.act.total++;
            scores.extract.total++;
            scores.observe.total++;

            if (retryCount < maxRetries) {
              retryCount++;
              continue;
            }
          }
        }
      } catch (testError) {
        logger.log({
          message: `Error in test case ${index + 1}: ${testError instanceof Error ? testError.message : "Unknown error"}`,
          level: 2,
        });
      }
    }

    // Calculate final scores
    const finalScores = {
      act: (scores.act.success / scores.act.total) * 100,
      extract: (scores.extract.success / scores.extract.total) * 100,
      observe: (scores.observe.success / scores.observe.total) * 100,
    };

    // Check if all scores meet the minimum threshold
    const success =
      finalScores.act >= 80 &&
      finalScores.extract >= 80 &&
      finalScores.observe >= 80;

    return {
      _success: success,
      logs,
      debugUrl: initResult?.debugUrl || "",
      sessionUrl: initResult?.sessionUrl || "",
      scores: finalScores,
    };
  } catch (error) {
    return {
      _success: false,
      logs,
      debugUrl: initResult?.debugUrl || "",
      sessionUrl: initResult?.sessionUrl || "",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    if (currentStagehand) {
      try {
        await currentStagehand.close();
      } catch (closeError) {
        logger.log({
          message: `Error closing Stagehand: ${closeError instanceof Error ? closeError.message : "Unknown error"}`,
          level: 1,
        });
      }
    }
  }
};
