import { Stagehand } from "../../lib";
import { EvalFunction } from "../../types/evals";
import { validateUrlMatch } from "../utils/url_validation";
import { loadMind2WebDataset } from "../datasets/mind2web";
import { z } from "zod";
import { LogLine } from "../../types/log";
import { Browserbase } from "@browserbasehq/sdk";
import { RuntimeBrowserSettings, ensureRuntimeCompatibleSettings } from "../../types/browserbase";

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
export const mind2web: EvalFunction = async ({ modelName, logger, useTextExtract }) => {
  const logs: LogLine[] = [];
  let debugUrl = "";
  let sessionUrl = "";
  let stagehand: Stagehand | undefined;

  try {
    // Load test cases from the Mind2Web dataset
    const testCases = await loadMind2WebDataset();

    // Initialize scores for each category
    const scores = {
      act: 0,
      extract: 0,
      observe: 0,
      total: testCases.length * testCases[0].evaluation.length,
    };

    // Initialize browser settings using RuntimeBrowserSettings and ensure compatibility
    const runtimeSettings: RuntimeBrowserSettings = {
      fingerprint: {
        httpVersion: "1",
      },
      viewport: {
        width: 1280,
        height: 800,
      },
      logSession: true,
      recordSession: true,
    };

    // Convert runtime settings to BrowserSettings for SDK compatibility
    const runtimeCompatibleSettings = ensureRuntimeCompatibleSettings({
      ...runtimeSettings,
      fingerprint: {
        ...runtimeSettings.fingerprint,
        httpVersion: "1" as unknown as 1,  // Type assertion to satisfy both compile-time and runtime
      },
    });

    // Use runtime settings directly but with proper type assertions
    const browserSettings: Browserbase.Sessions.SessionCreateParams["browserSettings"] = {
      ...runtimeCompatibleSettings,
      fingerprint: runtimeCompatibleSettings.fingerprint && {
        ...runtimeCompatibleSettings.fingerprint,
        httpVersion: "1" as unknown as 1,  // Type assertion to satisfy both compile-time and runtime
      },
    };

    stagehand = new Stagehand({
      env: "BROWSERBASE",
      modelName,
      logger: (line: LogLine) => {
        logs.push(line);
        logger.log(line);
      },
      browserbaseSessionCreateParams: {
        projectId: process.env.BROWSERBASE_PROJECT_ID || "",
        timeout: 60,
        browserSettings,
      },
    });

    const initResult = await stagehand.init();
    debugUrl = initResult.debugUrl;
    sessionUrl = initResult.sessionUrl;

    // Process each test case
    for (const testCase of testCases) {
      try {
        // Process each evaluation step
        for (const step of testCase.evaluation) {
          try {
            // Use act() to navigate to the target URL
            const actResult = await stagehand.act({
              action: `Navigate to ${step.content.url}`,
              useVision: "fallback",
            });

            if (actResult.success) {
              scores.act++;
            }

            // Define schema for extracting URL information
            const extractSchema = z.object({
              currentUrl: z.string(),
              pageTitle: z.string(),
            });

            // Use extract() to get current URL and page title
            const extractResult = await stagehand.extract({
              instruction: "Extract the current URL and page title",
              schema: extractSchema,
              useTextExtract,
            });

            const extractSuccess = validateUrlMatch(
              extractResult.currentUrl,
              step.content.reference_answer
            );

            if (extractSuccess) {
              scores.extract++;
            }

            // Use observe() to validate page state
            const observeResults = await stagehand.observe({
              instruction: `Verify that the page contains elements related to ${testCase.task}`,
              useVision: true,
            });

            // Check if any observation matches the success criteria
            const observeSuccess = observeResults.some((result) => {
              const descriptionMatch = result.description
                .toLowerCase()
                .includes(step.content.reference_answer.toLowerCase());
              const selectorMatch = result.selector
                .toLowerCase()
                .includes(step.content.reference_answer.toLowerCase());
              return descriptionMatch || selectorMatch;
            });

            if (observeSuccess) {
              scores.observe++;
            }

          } catch (error) {
            logs.push({
              category: "eval",
              message: `Error processing evaluation step: ${error instanceof Error ? error.message : String(error)}`,
              level: 2,
            });
            continue;
          }
        }
      } catch (error) {
        logs.push({
          category: "eval",
          message: `Error processing test case: ${error instanceof Error ? error.message : String(error)}`,
          level: 2,
        });
        continue;
      }
    }

    // Calculate final scores as percentages
    const finalScores = {
      act: (scores.act / scores.total) * 100,
      extract: (scores.extract / scores.total) * 100,
      observe: (scores.observe / scores.total) * 100,
    };

    // Check if all categories meet the minimum threshold
    const success =
      finalScores.act >= 80 &&
      finalScores.extract >= 80 &&
      finalScores.observe >= 80;

    return {
      _success: success,
      logs,
      debugUrl,
      sessionUrl,
      scores: finalScores,
    };
  } catch (error) {
    return {
      _success: false,
      logs,
      debugUrl,
      sessionUrl,
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
      });
    }
  }
};
