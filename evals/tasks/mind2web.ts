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

    // Initialize single browser instance
    currentStagehand = new Stagehand({
      env: "LOCAL",
      modelName,
      logger: (message: LogLine) => logger.log(message),
      headless: true,
      verbose: 1,
      enableCaching: true,
    });

    currentInitResult = await currentStagehand.init();

    for (const [index, testCase] of testCases.entries()) {
      logs.push({
        message: `Processing test case ${index + 1}/${testCases.length}: ${testCase.task}`,
        level: 1,
      });

      try {
        // Process each evaluation step
        for (const step of testCase.evaluation) {
          // Validate URL match
          const urlMatches = validateUrlMatch(
            step.content.url,
            step.content.reference_answer,
          );
          if (!urlMatches) {
            logger.log({
              message: `URL validation failed for ${step.content.url}`,
              level: 2,
            });
            continue;
          }

          // Navigate to URL using page API
          await currentStagehand.page.goto(step.content.url, {
            waitUntil: "networkidle",
          });

          // Define schema for extraction
          const schema = z.object({
            field_1: z.string().describe("Main information about the task"),
            field_2: z.string().describe("Additional details or context"),
            field_3: z.string().describe("Any supplementary information"),
          });

          // Perform actions based on task
          const actResult = await currentStagehand.act({
            action: testCase.task,
          });

          if (actResult.success) {
            scores.act.success++;
          }
          scores.act.total++;

          // Extract information
          const extractResult = await currentStagehand.extract({
            instruction: `Extract the following information about ${testCase.task}:
              1. The main result or answer
              2. Any supporting details
              3. Additional context or verification`,
            schema,
          });

          // Verify extracted content matches reference answer
          const extractedText = Object.values(extractResult).join(" ");
          if (extractedText.includes(step.content.reference_answer)) {
            scores.extract.success++;
          }
          scores.extract.total++;

          // Observe page state
          const observeResults = await currentStagehand.observe();
          if (observeResults && observeResults.length > 0) {
            scores.observe.success++;
          }
          scores.observe.total++;

          // Calculate and log progress
          const updateScores = {
            act: (scores.act.success / scores.act.total) * 100,
            extract: (scores.extract.success / scores.extract.total) * 100,
            observe: (scores.observe.success / scores.observe.total) * 100,
          };

          logger.log({
            message: `Progress - Act: ${updateScores.act.toFixed(1)}%, Extract: ${updateScores.extract.toFixed(1)}%, Observe: ${updateScores.observe.toFixed(1)}%`,
            level: 1,
            auxiliary: {
              value: {
                value: JSON.stringify({
                  task: testCase.task,
                  url: step.content.url,
                  scores: updateScores,
                }),
                type: "object",
              },
            },
          });
        }
      } catch (error) {
        logger.log({
          message: `Error processing test case: ${error instanceof Error ? error.message : "Unknown error"}`,
          level: 2,
          auxiliary: {
            value: {
              value: JSON.stringify({ task: testCase.task }),
              type: "object",
            },
          },
        });
      }
    }

    // Calculate final percentages
    const finalScores = {
      act: (scores.act.success / scores.act.total) * 100,
      extract: (scores.extract.success / scores.extract.total) * 100,
      observe: (scores.observe.success / scores.observe.total) * 100,
    };

    // Check if all thresholds are met
    const success =
      finalScores.act >= 80 &&
      finalScores.extract >= 80 &&
      finalScores.observe >= 80;

    return {
      _success: success,
      logs,
      debugUrl: currentInitResult?.debugUrl || "",
      sessionUrl: currentInitResult?.sessionUrl || "",
      scores: finalScores,
    };
  } catch (error) {
    return {
      _success: false,
      logs,
      debugUrl: currentInitResult?.debugUrl || "",
      sessionUrl: currentInitResult?.sessionUrl || "",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    // Clean up browser instance
    if (currentStagehand) {
      await currentStagehand.close();
    }
  }
};
