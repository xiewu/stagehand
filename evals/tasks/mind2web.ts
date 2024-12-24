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

    // Initialize Stagehand
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
        // Track state through evaluation steps
        let currentState = {
          success: true,
          lastUrl: "",
          progress: [] as string[],
        };

        // Process each evaluation step sequentially
        for (const [stepIndex, step] of testCase.evaluation.entries()) {
          if (!currentState.success) {
            break; // Skip remaining steps if previous step failed
          }

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
            currentState.success = false;
            continue;
          }

          // Navigate to URL if different from current
          if (step.content.url !== currentState.lastUrl) {
            await currentStagehand.page.goto(step.content.url, {
              waitUntil: "networkidle",
            });
            currentState.lastUrl = step.content.url;
            await currentStagehand.page.waitForLoadState("domcontentloaded");
          }

          // Create step-specific schema
          const schema = z.object({
            currentUrl: z.string().describe("Current URL of the page"),
            targetElement: z.string().describe("Element that matches the reference answer"),
            nextAction: z.string().describe("Next action needed to complete the task"),
          });

          // Build context from previous steps
          const stepContext = currentState.progress.join(" -> ");

          // Perform action with specific instruction
          const actResult = await currentStagehand.act({
            action: `For task "${testCase.task}", find element containing "${step.content.reference_answer}". Previous steps: ${stepContext}`,
          });

          if (actResult.success) {
            scores.act.success++;
            currentState.progress.push(`Found ${step.content.reference_answer}`);
          }
          scores.act.total++;

          // Extract information with context
          const extractResult = await currentStagehand.extract({
            instruction: `Extract information about finding "${step.content.reference_answer}" for task: ${testCase.task}. Previous steps: ${stepContext}`,
            schema,
          });

          // Validate extraction against reference
          const extractSuccess =
            extractResult.currentUrl.includes(step.content.reference_answer) ||
            extractResult.targetElement.includes(step.content.reference_answer);

          if (extractSuccess) {
            scores.extract.success++;
          }
          scores.extract.total++;

          // Observe page state
          const observeResults = await currentStagehand.observe();
          const observeSuccess = observeResults.some(result =>
            result.description.toLowerCase().includes(step.content.reference_answer.toLowerCase())
          );

          if (observeSuccess) {
            scores.observe.success++;
          }
          scores.observe.total++;

          // Update current state
          currentState.success = actResult.success && extractSuccess && observeSuccess;

          // Log detailed progress
          const updateScores = {
            act: (scores.act.success / scores.act.total) * 100,
            extract: (scores.extract.success / scores.extract.total) * 100,
            observe: (scores.observe.success / scores.observe.total) * 100,
          };

          logger.log({
            message: `Step ${stepIndex + 1}/${testCase.evaluation.length} - Act: ${updateScores.act.toFixed(1)}%, Extract: ${updateScores.extract.toFixed(1)}%, Observe: ${updateScores.observe.toFixed(1)}%`,
            level: 1,
            auxiliary: {
              value: {
                value: JSON.stringify({
                  task: testCase.task,
                  step: stepIndex + 1,
                  url: step.content.url,
                  scores: updateScores,
                  stepSuccess: currentState.success,
                  progress: currentState.progress,
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
              value: JSON.stringify({
                task: testCase.task,
                error: error instanceof Error ? error.stack : "Unknown error"
              }),
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
    if (currentStagehand) {
      await currentStagehand.close();
    }
  }
};
