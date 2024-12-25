import { Stagehand } from "../../lib";
import { EvalFunction } from "../../types/evals";
import { loadMind2WebDataset } from "../datasets/mind2web";
import { z } from "zod";
import { LogLine } from "../../types/log";
import { RuntimeBrowserSettings } from "../../types/browserbase";

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

export interface TestCase {
  task: string;
  evaluation: EvaluationStep[];
}

/**
 * Evaluates Mind2Web dataset tasks using Stagehand's core functions
 */
export const mind2web: EvalFunction = async ({
  modelName,
  logger,
  useTextExtract,
}) => {
  const logs: LogLine[] = [];
  let debugUrl = "";
  let sessionUrl = "";
  let stagehand: Stagehand | undefined;

  try {
    // Load test cases from the Mind2Web dataset
    const testCases = await loadMind2WebDataset();
    logs.push({
      category: "eval",
      message: `Loaded ${testCases.length} test cases from Mind2Web dataset`,
      level: 1,
    });

    // Initialize scores for each category
    const scores = {
      act: 0,
      extract: 0,
      observe: 0,
      total: testCases.length * testCases[0].evaluation.length,
    };

    // Use runtime-compatible browser settings
    const browserSettings: RuntimeBrowserSettings = {
      fingerprint: {
        httpVersion: "2",
        browsers: ["chrome"],
        devices: ["desktop"],
        operatingSystems: ["linux"],
      },
      viewport: {
        width: 1280,
        height: 720,
      },
    };

    // Initialize Stagehand in LOCAL mode
    logs.push({
      category: "eval",
      message: "Initializing Stagehand in LOCAL mode",
      level: 1,
      auxiliary: {
        browserSettings: {
          value: JSON.stringify(browserSettings),
          type: "object",
        },
      },
    });

    stagehand = new Stagehand({
      env: "LOCAL",
      modelName,
      logger: (line: LogLine) => {
        logs.push(line);
        logger.log(line);
      },
      headless: true, // Run headless for evaluation
    });

    try {
      logs.push({
        category: "eval",
        message: "Initializing Stagehand browser session",
        level: 1,
      });

      await stagehand.init();

      logs.push({
        category: "eval",
        message: "Successfully initialized Stagehand browser session",
        level: 1,
      });
    } catch (initError) {
      throw new Error(
        `Failed to initialize Stagehand: ${
          initError instanceof Error ? initError.message : String(initError)
        }`,
      );
    }

    // Process each test case
    for (const testCase of testCases) {
      logs.push({
        category: "eval",
        message: `Processing test case: ${testCase.task}`,
        level: 1,
        auxiliary: {
          task: {
            value: JSON.stringify(testCase),
            type: "object",
          },
        },
      });

      try {
        // Process each evaluation step
        for (const step of testCase.evaluation) {
          try {
            // Navigate to URL using act
            const actResult = await stagehand.act({
              action: `Navigate to ${step.content.url}`,
              useVision: "fallback",
            });

            logs.push({
              category: "eval",
              message: `Act result for URL ${step.content.url}: ${actResult.success}`,
              level: 1,
              auxiliary: {
                actDetails: {
                  value: JSON.stringify(actResult),
                  type: "object",
                },
              },
            });

            if (!actResult.success) {
              continue;
            }

            // Extract content if needed
            if (step.content.key) {
              const extractSchema = z.object({
                [step.content.key]: z.string(),
              });

              const extractResult = await stagehand.extract({
                instruction: `Extract the ${step.content.key} from the page`,
                schema: extractSchema,
                useTextExtract, // Use the provided extraction strategy
              });

              const extractSuccess =
                extractResult &&
                extractResult[step.content.key]
                  ?.toString()
                  .includes(step.content.reference_answer);

              logs.push({
                category: "eval",
                message: `Extract result for key ${step.content.key}: ${extractSuccess}`,
                level: 1,
                auxiliary: {
                  extractDetails: {
                    value: JSON.stringify(extractResult),
                    type: "object",
                  },
                },
              });

              if (extractSuccess) {
                scores.extract++;
              }
            }

            // Observe page state
            const observeResults = await stagehand.observe({
              instruction: `Find elements related to ${step.content.reference_answer}`,
              useVision: true,
            });

            const observeSuccess = observeResults.some((result) => {
              const descriptionMatch = result.description
                ?.toLowerCase()
                .includes(step.content.reference_answer.toLowerCase());
              const selectorMatch = result.selector?.includes(
                step.content.reference_answer,
              );
              return descriptionMatch || selectorMatch;
            });

            logs.push({
              category: "eval",
              message: `Observe result: ${observeSuccess}`,
              level: 1,
              auxiliary: {
                observeDetails: {
                  value: JSON.stringify(observeResults),
                  type: "object",
                },
              },
            });

            if (observeSuccess) {
              scores.observe++;
            }

            if (actResult.success) {
              scores.act++;
            }
          } catch (error) {
            logs.push({
              category: "eval",
              message: `Error processing evaluation step: ${error instanceof Error ? error.message : String(error)}`,
              level: 2,
              auxiliary: {
                stack: {
                  value:
                    error instanceof Error ? error.stack || "" : String(error),
                  type: "string",
                },
                step: {
                  value: JSON.stringify(step),
                  type: "object",
                },
              },
            });
            continue;
          }
        }
      } catch (error) {
        logs.push({
          category: "eval",
          message: `Error processing test case: ${error instanceof Error ? error.message : String(error)}`,
          level: 2,
          auxiliary: {
            stack: {
              value: error instanceof Error ? error.stack || "" : String(error),
              type: "string",
            },
          },
        });
        continue;
      }
    }

    // Calculate final scores as percentages
    const finalScores = {
      act: Math.round((scores.act / scores.total) * 100),
      extract: Math.round((scores.extract / scores.total) * 100),
      observe: Math.round((scores.observe / scores.total) * 100),
    };

    // Check if all categories meet the minimum threshold
    const success =
      finalScores.act >= 80 &&
      finalScores.extract >= 80 &&
      finalScores.observe >= 80;

    logs.push({
      category: "eval",
      message: `Final scores - Act: ${finalScores.act}%, Extract: ${finalScores.extract}%, Observe: ${finalScores.observe}%`,
      level: 1,
    });

    return {
      _success: success,
      logs,
      debugUrl: "", // LOCAL mode doesn't use debug/session URLs
      sessionUrl: "", // LOCAL mode doesn't use debug/session URLs
      _scores: finalScores,
    };
  } catch (error) {
    logs.push({
      category: "eval",
      message: `Error in mind2web evaluation: ${error instanceof Error ? error.message : String(error)}`,
      level: 2,
      auxiliary: {
        stack: {
          value: error instanceof Error ? error.stack || "" : String(error),
          type: "string",
        },
      },
    });

    return {
      _success: false,
      logs,
      debugUrl: "", // LOCAL mode doesn't use debug/session URLs
      sessionUrl: "", // LOCAL mode doesn't use debug/session URLs
      _scores: {
        act: 0,
        extract: 0,
        observe: 0,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    try {
      if (stagehand?.close) {
        await stagehand.close();
      }
    } catch (closeError) {
      logs.push({
        category: "eval",
        message: `Error closing stagehand: ${closeError instanceof Error ? closeError.message : String(closeError)}`,
        level: 2,
        auxiliary: {
          stack: {
            value:
              closeError instanceof Error
                ? closeError.stack || ""
                : String(closeError),
            type: "string",
          },
        },
      });
    }
  }
};
