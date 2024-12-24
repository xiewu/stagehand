import { Stagehand } from "../../lib";
import { EvalFunction } from "../../types/evals";
import { loadMind2WebDataset } from "../datasets/mind2web";
import { z } from "zod";
import { LogLine } from "../../types/log";

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
  const scores: CategoryScores = {
    act: { success: 0, total: 0, percentage: 0 },
    extract: { success: 0, total: 0, percentage: 0 },
    observe: { success: 0, total: 0, percentage: 0 },
  };

  let stagehand: Stagehand | null = null;

  try {
    const testCases = await loadMind2WebDataset();
    const maxCases = 5; // Limit test cases for initial verification
    const testSubset = testCases.slice(0, maxCases);

    logs.push({
      message: `Testing with ${testSubset.length} cases from Mind2Web dataset`,
      level: 1,
      auxiliary: {
        value: {
          value: testSubset.length.toString(),
          type: "integer",
        },
      },
    });

    for (const [index, testCase] of testSubset.entries()) {
      // Ensure previous browser instance is properly closed
      if (stagehand) {
        try {
          await stagehand.close();
          stagehand = null;
        } catch (error) {
          console.error("Error closing browser:", error);
        }
      }

      stagehand = new Stagehand({
        env: "LOCAL",
        modelName,
        logger: (message: LogLine) => logger.log(message),
        headless: true,
        verbose: 1,
        enableCaching: true,
      });

      await stagehand.init();

      try {
        // Set navigation timeout
        await stagehand.page.setDefaultNavigationTimeout(30000);
        await stagehand.page.setDefaultTimeout(30000);

        // Initial navigation with retry logic
        let navigationSuccess = false;
        for (let attempt = 0; attempt < 3 && !navigationSuccess; attempt++) {
          try {
            await stagehand.page.goto(testCase.evaluation[0].content.url, {
              waitUntil: "networkidle",
            });
            navigationSuccess = true;
          } catch (error) {
            if (attempt === 2) throw error;
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }

        // Test observe() functionality
        scores.observe.total++;
        try {
          const actions = await stagehand.observe();
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

        // Test act() functionality with retry
        scores.act.total++;
        try {
          const actResult = await stagehand.act({
            action: testCase.task,
          });
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
          }
        } catch (error) {
          logs.push({
            message: "Act test failed",
            level: 2,
            auxiliary: {
              value: {
                value: error instanceof Error ? error.message : "Unknown error",
                type: "string",
              },
            },
          });
        }

        // Test extract() functionality with dynamic schema
        scores.extract.total++;
        try {
          // Create dynamic schema based on test case
          const schemaFields: Record<string, z.ZodString> = {};
          testCase.evaluation.forEach((step, index) => {
            if (step.content.reference_answer) {
              schemaFields[`field_${index}`] = z.string();
            }
          });

          const dynamicSchema = z.object(schemaFields);
          const extractResult = await stagehand.extract({
            instruction: testCase.task,
            schema: dynamicSchema,
          });

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
          }
        } catch (error) {
          logs.push({
            message: "Extract test failed",
            level: 2,
            auxiliary: {
              value: {
                value: error instanceof Error ? error.message : "Unknown error",
                type: "string",
              },
            },
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
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        logs.push({
          message: "Test case failed",
          level: 1,
          auxiliary: {
            value: {
              value: errorMessage,
              type: "string",
            },
          },
        });
      }
    }

    // Clean up final browser instance
    if (stagehand) {
      await stagehand.close();
    }

    // Final success is determined by meeting all category thresholds
    const success =
      scores.act.percentage >= 80 &&
      scores.extract.percentage >= 80 &&
      scores.observe.percentage >= 80;

    return {
      _success: success,
      logs,
      debugUrl: "",
      sessionUrl: "",
      error: undefined,
    };
  } catch (error) {
    // Clean up browser instance on error
    if (stagehand) {
      await stagehand.close();
    }

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      _success: false,
      logs,
      debugUrl: "",
      sessionUrl: "",
      error: errorMessage,
    };
  }
};
