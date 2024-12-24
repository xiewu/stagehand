import { z } from "zod";
import { EvalFunction } from "../../types/evals";
import { Stagehand } from "../../lib";
import { InitResult } from "../../types/stagehand";
import { LogLine } from "../../types/log";
import { loadMind2WebDataset } from "../datasets/mind2web";

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

export const mind2web: EvalFunction = async ({ modelName, logger }) => {
  const logs: LogLine[] = [];
  let currentStagehand: Stagehand | undefined;
  let currentInitResult: InitResult | undefined;

  const scores: CategoryScores = {
    act: { success: 0, total: 0, percentage: 0 },
    extract: { success: 0, total: 0, percentage: 0 },
    observe: { success: 0, total: 0, percentage: 0 },
  };

  try {
    const testCases = await loadMind2WebDataset();
    const maxCases = 1; // Start with just one test case for debugging
    const testSubset = testCases.slice(0, maxCases);

    logs.push({
      message: `Starting Mind2Web eval with ${testSubset.length} test case for initial verification`,
      level: 1,
    });

    for (const [index, testCase] of testSubset.entries()) {
      logs.push({
        message: `Processing test case ${index + 1}/${testSubset.length}: ${testCase.task}`,
        level: 1,
      });

      // Ensure previous browser instance is properly closed with timeout
      if (currentStagehand) {
        try {
          logs.push({
            message: "Closing previous browser instance",
            level: 2,
          });
          await Promise.race([
            currentStagehand.close(),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("Browser close timeout")),
                10000,
              ),
            ),
          ]);
          currentStagehand = undefined;
          currentInitResult = undefined;
        } catch (error) {
          logs.push({
            message: `Error closing browser: ${error instanceof Error ? error.message : "Unknown error"}`,
            level: 2,
          });
          // Force cleanup if timeout
          currentStagehand = undefined;
          currentInitResult = undefined;
        }
      }

      logs.push({
        message: "Creating new Stagehand instance",
        level: 2,
      });

      try {
        currentStagehand = new Stagehand({
          env: "LOCAL",
          modelName,
          logger: (message: LogLine) => logger.log(message),
          headless: true,
          verbose: 1,
          enableCaching: true, // Re-enable caching to reduce LLM calls
        });

        currentInitResult = await currentStagehand.init();

        // Add delay between browser operations
        const delay = (ms: number) =>
          new Promise((resolve) => setTimeout(resolve, ms));
        await delay(1000); // 1 second delay for browser setup

        // Set navigation timeout
        await currentStagehand.page.setDefaultNavigationTimeout(30000);
        await currentStagehand.page.setDefaultTimeout(30000);

        // Initial navigation with retry logic
        let navigationSuccess = false;
        for (let attempt = 0; attempt < 3 && !navigationSuccess; attempt++) {
          try {
            await currentStagehand.page.goto(
              testCase.evaluation[0].content.url,
              {
                waitUntil: "networkidle",
              },
            );
            navigationSuccess = true;
          } catch (error) {
            if (attempt === 2) throw error;
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }

        // Test observe() functionality
        scores.observe.total++;
        try {
          const actions = await currentStagehand.observe();
          if (actions && actions.length > 0) {
            scores.observe.success++;
            logs.push({
              message: "Observe test succeeded",
              level: 2,
              auxiliary: {
                value: {
                  value: JSON.stringify(actions),
                  type: "object",
                },
              },
            });
          }
        } catch (error) {
          logs.push({
            message: "Observe test failed",
            level: 2,
            auxiliary: {
              value: {
                value: error instanceof Error ? error.message : "Unknown error",
                type: "string",
              },
            },
          });
        }

        // Test act() functionality with retry and timeout
        scores.act.total++;
        try {
          logs.push({
            message: `Attempting act() with task: ${testCase.task}`,
            level: 2,
          });

          const actPromise = currentStagehand.act({
            action: testCase.task,
          });

          const actResult = (await Promise.race([
            actPromise,
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Act timeout")), 45000),
            ),
          ])) as { success: boolean };

          if (actResult.success) {
            scores.act.success++;
            logs.push({
              message: "Act test succeeded",
              level: 2,
              auxiliary: {
                value: {
                  value: JSON.stringify(actResult),
                  type: "object",
                },
              },
            });
          } else {
            logs.push({
              message: "Act test failed: action unsuccessful",
              level: 2,
            });
          }

          // Add delay between operations
          await delay(2000);
        } catch (error) {
          logs.push({
            message: `Act test failed with error: ${error instanceof Error ? error.message : "Unknown error"}`,
            level: 2,
          });
        }

        // Test extract() functionality with dynamic schema and timeout
        scores.extract.total++;
        try {
          logs.push({
            message: "Creating dynamic schema for extraction",
            level: 2,
          });

          // Create dynamic schema based on test case
          const schemaFields: Record<string, z.ZodString> = {};
          testCase.evaluation.forEach((step: EvaluationStep, index: number) => {
            if (step.content.reference_answer) {
              schemaFields[`field_${index}`] = z.string();
            }
          });

          const dynamicSchema = z.object(schemaFields);

          logs.push({
            message: `Attempting extract() with task: ${testCase.task}`,
            level: 2,
          });
          const extractPromise = currentStagehand.extract({
            instruction: testCase.task,
            schema: dynamicSchema,
          });

          const extractResult = (await Promise.race([
            extractPromise,
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Extract timeout")), 45000),
            ),
          ])) as z.infer<typeof dynamicSchema>;

          if (extractResult && dynamicSchema.safeParse(extractResult).success) {
            scores.extract.success++;
            logs.push({
              message: "Extract test succeeded",
              level: 2,
              auxiliary: {
                value: {
                  value: JSON.stringify(extractResult),
                  type: "object",
                },
              },
            });
          } else {
            logs.push({
              message: "Extract test failed: schema validation failed",
              level: 2,
            });
          }
        } catch (error) {
          logs.push({
            message: `Extract test failed with error: ${error instanceof Error ? error.message : "Unknown error"}`,
            level: 2,
          });
        }

        // Calculate success percentages after each test case
        scores.act.percentage = (scores.act.success / scores.act.total) * 100;
        scores.extract.percentage =
          (scores.extract.success / scores.extract.total) * 100;
        scores.observe.percentage =
          (scores.observe.success / scores.observe.total) * 100;

        // Log progress
        logs.push({
          message: `Test case ${index + 1}/${testSubset.length} completed`,
          level: 1,
          auxiliary: {
            value: {
              value: JSON.stringify({
                act: scores.act.percentage,
                extract: scores.extract.percentage,
                observe: scores.observe.percentage,
              }),
              type: "object",
            },
          },
        });
      } catch (error) {
        logs.push({
          message: "Critical error in Mind2Web eval",
          level: 1,
          auxiliary: {
            value: {
              value:
                error instanceof Error ? error.message : JSON.stringify(error),
              type: "string",
            },
          },
        });

        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return {
          _success: false,
          logs,
          error: errorMessage,
          debugUrl: currentInitResult?.debugUrl,
          sessionUrl: currentInitResult?.sessionUrl,
        };
      } finally {
        // Ensure browser cleanup in all cases
        if (currentStagehand) {
          try {
            await currentStagehand.close();
          } catch (error) {
            logs.push({
              message: "Error during browser cleanup",
              level: 2,
              auxiliary: {
                value: {
                  value:
                    error instanceof Error
                      ? error.message
                      : JSON.stringify(error),
                  type: "string",
                },
              },
            });
          }
          currentStagehand = undefined;
          currentInitResult = undefined;
        }
      }
    }

    // Calculate final percentages
    scores.act.percentage = (scores.act.success / scores.act.total) * 100;
    scores.extract.percentage =
      (scores.extract.success / scores.extract.total) * 100;
    scores.observe.percentage =
      (scores.observe.success / scores.observe.total) * 100;

    // Final success is determined by meeting all category thresholds
    const success =
      scores.act.percentage >= 80 &&
      scores.extract.percentage >= 80 &&
      scores.observe.percentage >= 80;

    logs.push({
      message: "Mind2Web eval completed",
      level: 1,
      auxiliary: {
        value: {
          value: JSON.stringify({
            act: scores.act.percentage,
            extract: scores.extract.percentage,
            observe: scores.observe.percentage,
            success,
          }),
          type: "object",
        },
      },
    });

    return {
      _success: success,
      logs,
      error: undefined,
      debugUrl: currentInitResult?.debugUrl,
      sessionUrl: currentInitResult?.sessionUrl,
    };
  } catch (error) {
    // Clean up browser instance on error
    if (currentStagehand) {
      try {
        await currentStagehand.close();
      } catch (cleanupError) {
        logs.push({
          message: `Error during final cleanup: ${cleanupError instanceof Error ? cleanupError.message : "Unknown error"}`,
          level: 2,
        });
      }
      currentStagehand = undefined;
      currentInitResult = undefined;
    }

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      _success: false,
      logs,
      error: errorMessage,
      debugUrl: currentInitResult?.debugUrl,
      sessionUrl: currentInitResult?.sessionUrl,
    };
  }
};
