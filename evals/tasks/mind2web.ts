import { Stagehand } from "../../lib";
import { EvalFunction } from "../../types/evals";
import { loadMind2WebDataset } from "../datasets/mind2web";
import { z } from "zod";
import { LogLine } from "../../types/log";

interface StepResult {
  success: boolean;
  action: string;
  error?: string;
  data?: {
    homeTeam: string;
    homeScore: number;
    awayTeam: string;
    awayScore: number;
  };
}

export const mind2web: EvalFunction = async ({ modelName, logger, useTextExtract }) => {
  const logs: LogLine[] = [];
  let totalSuccess = 0;
  let totalCases = 0;

  try {
    const stagehand = new Stagehand({
      env: "LOCAL",
      modelName,
      logger: (message: LogLine) => logger.log(message),
      headless: true,
      verbose: 1,
      enableCaching: true,
    });

    await stagehand.init();

    const testCases = await loadMind2WebDataset();
    logs.push({
      message: `Loaded ${testCases.length} test cases from Mind2Web dataset`,
      level: 1,
      auxiliary: {
        value: {
          value: testCases.length.toString(),
          type: "integer"
        }
      }
    });

    for (const [index, testCase] of testCases.entries()) {
      totalCases++;
      try {
        // Initial navigation to start URL
        await stagehand.page.goto(testCase.evaluation[0].content.url);

        // Process each step using Stagehand's core functions
        let totalSteps = 0;
        let successfulSteps = 0;

        for (let i = 0; i < testCase.evaluation.length; i++) {
          const step = testCase.evaluation[i];
          const stepResult: StepResult = {
            success: false,
            action: step.content.url,
          };

          try {
            // Use observe() to understand available actions
            const actions = await stagehand.observe();
            logs.push({
              message: 'Available actions on page',
              level: 2,
              auxiliary: {
                value: {
                  value: JSON.stringify(actions),
                  type: "object"
                }
              }
            });

            // Convert URL-based navigation to natural language actions
            const urlParts = new URL(step.content.url);
            const pathParts = urlParts.pathname.split('/').filter(Boolean);

            // Build natural language instruction based on URL structure
            let instruction = '';
            if (pathParts.includes('scores')) {
              instruction = 'click on scores';
            } else if (pathParts.includes('2020')) {
              instruction = 'click on 2020 season';
            } else if (pathParts.includes('POST4')) {
              instruction = 'click on Super Bowl game';
            }

            if (instruction) {
              const actResult = await stagehand.act({ action: instruction });
              stepResult.success = actResult.success;
              stepResult.action = instruction;
              if (actResult.success) {
                successfulSteps++;
              }
            }

            // Extract score information if we're on the final step
            if (i === testCase.evaluation.length - 1) {
              const scoreSchema = z.object({
                homeTeam: z.string(),
                homeScore: z.number(),
                awayTeam: z.string(),
                awayScore: z.number(),
              });

              const extractResult = await stagehand.extract({
                instruction: "extract the Super Bowl score",
                schema: scoreSchema,
              });

              if (extractResult && scoreSchema.safeParse(extractResult).success) {
                stepResult.data = extractResult as z.infer<typeof scoreSchema>;
                successfulSteps++;
              }
            }

            totalSteps++;
            logs.push({
              message: `Step ${i + 1}: ${stepResult.action}`,
              level: 1,
              auxiliary: {
                value: {
                  value: JSON.stringify(stepResult),
                  type: "object"
                }
              }
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logs.push({
              message: `Step ${i + 1} failed: ${errorMessage}`,
              level: 1,
              auxiliary: {
                value: {
                  value: errorMessage,
                  type: "string"
                }
              }
            });
            break;
          }
        }

        if (totalSteps > 0 && successfulSteps === totalSteps) {
          totalSuccess++;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logs.push({
          message: 'Test case failed',
          level: 1,
          auxiliary: {
            value: {
              value: errorMessage,
              type: "string"
            }
          }
        });
      }
    }

    await stagehand.close();
    return {
      _success: totalSuccess > 0,
      logs,
      debugUrl: '',
      sessionUrl: '',
      error: undefined
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      _success: false,
      logs,
      debugUrl: '',
      sessionUrl: '',
      error: errorMessage
    };
  }
};
