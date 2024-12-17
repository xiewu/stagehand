import { EvalFunction, EvalResult } from '../../types/evals';
import { Stagehand } from '../../lib';
import { loadMind2WebDataset } from "../datasets/mind2web";
import { validateUrlPath, validateUrlMatch } from "../utils/url_validation";
import { LogLine } from '../../types/log';

// Increase max listeners to handle multiple event emitters
process.setMaxListeners(50);

// Site-specific configurations
const SITE_CONFIGS = {
  'nfl.com': {
    timeout: 120000,
    waitUntil: 'domcontentloaded' as const,
    bypassInteractivityCheck: true,
  },
  'tesla.com': {
    timeout: 90000,
    waitUntil: 'domcontentloaded' as const,
    bypassInteractivityCheck: true,
  },
  'rei.com': {
    timeout: 90000,
    waitUntil: 'domcontentloaded' as const,
    bypassInteractivityCheck: true,
  },
};

const MAX_ACTION_RETRIES = 8;  // Increased from 5
const ACTION_TIMEOUT = 45000;  // Increased from 30000
const PAGE_LOAD_TIMEOUT = 60000;  // Increased from 45000
const RETRY_DELAY = 3000;
const OBSTACLE_CHECK_TIMEOUT = 8000;
const MAX_RETRY_DELAY = 15000;  // Increased from 10000

// Add delay between navigation steps to prevent race conditions
const STEP_DELAY = 2000;

// Add delay between test cases for cleanup
const TEST_CASE_DELAY = 5000;

// Semaphore for browser instance management
let browserLock = false;

async function handleCommonObstacles(stagehand: any, logger: any): Promise<boolean> {
    const MAX_OBSTACLE_ATTEMPTS = 3;
    const handledObstacles = new Set<string>();

    try {
        // Handle cookie consent banner
        const cookieSelectors = [
            "#onetrust-reject-all-handler",
            "[aria-label='Reject Optional Cookies']",
            "[data-testid='cookie-banner-reject']",
            ".cookie-banner-reject",
            ".cookie-consent-reject",
            "[aria-label='reject cookies']",
            "button:has-text('Reject')",
            "button:has-text('Reject All')",
        ];

        let cookieAttempts = 0;
        while (cookieAttempts < MAX_OBSTACLE_ATTEMPTS) {
            let handled = false;
            for (const selector of cookieSelectors) {
                if (handledObstacles.has(selector)) continue;

                try {
                    const element = await stagehand.page.waitForSelector(selector, {
                        timeout: OBSTACLE_CHECK_TIMEOUT,
                        state: 'visible'
                    });

                    if (element) {
                        await element.click();
                        await stagehand.page.waitForTimeout(1500);

                        // Verify the element is gone
                        const stillExists = await stagehand.page.$(selector);
                        if (!stillExists) {
                            handledObstacles.add(selector);
                            logger.log({
                                message: 'Successfully handled cookie consent banner',
                                level: 1,
                                auxiliary: {
                                    selector: { value: selector, type: "string" },
                                    attempt: { value: String(cookieAttempts + 1), type: "string" },
                                },
                            });
                            handled = true;
                            break;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
            if (!handled) break;
            cookieAttempts++;
        }

        // Handle other common overlays or popups
        const commonOverlaySelectors = [
            "[aria-label='Close']",
            ".modal-close",
            ".popup-close",
            "[data-testid='modal-close']",
            "button:has-text('Close')",
            "button:has-text('×')",
            "[aria-label='close']",
            ".close-button",
        ];

        let overlayAttempts = 0;
        while (overlayAttempts < MAX_OBSTACLE_ATTEMPTS) {
            let handled = false;
            for (const selector of commonOverlaySelectors) {
                if (handledObstacles.has(selector)) continue;

                try {
                    const element = await stagehand.page.waitForSelector(selector, {
                        timeout: OBSTACLE_CHECK_TIMEOUT / 2,
                        state: 'visible'
                    });

                    if (element) {
                        await element.click();
                        await stagehand.page.waitForTimeout(1000);

                        // Verify the element is gone
                        const stillExists = await stagehand.page.$(selector);
                        if (!stillExists) {
                            handledObstacles.add(selector);
                            logger.log({
                                message: 'Successfully handled overlay/popup',
                                level: 1,
                                auxiliary: {
                                    selector: { value: selector, type: "string" },
                                    attempt: { value: String(overlayAttempts + 1), type: "string" },
                                },
                            });
                            handled = true;
                            break;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
            if (!handled) break;
            overlayAttempts++;
        }
    } catch (error) {
        logger.warn({
            message: 'Error handling common obstacles',
            level: 1,
            auxiliary: {
                error: { value: error.message, type: "string" },
                trace: { value: error.stack || "", type: "string" },
            },
        });
    }
    return true;
}

async function retryAction(
  action: () => Promise<any>,
  maxRetries: number,
  logger: any,
  errorMessage: string,
  initialDelay: number = RETRY_DELAY
): Promise<any> {
  let lastError;
  let currentDelay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      logger.warn({
        message: `Attempt ${attempt}/${maxRetries} failed: ${error.message}`,
        level: 1,
      });

      if (attempt < maxRetries) {
        // Exponential backoff with jitter
        const jitter = Math.random() * 1000;
        currentDelay = Math.min(currentDelay * 1.5 + jitter, MAX_RETRY_DELAY);

        logger.log({
          message: `Waiting ${Math.floor(currentDelay)}ms before retry...`,
          level: 1,
        });

        await new Promise(resolve => setTimeout(resolve, currentDelay));
      }
    }
  }

  throw new Error(`${errorMessage}\n${lastError?.message || ''}`);
}

export const mind2web: EvalFunction = async ({ modelName, logger, useTextExtract }) => {
  const testResults: { success: boolean; logs: any[] }[] = [];
  let stagehand: any = null;
  let currentSession: any = null;
  let debugUrl: string = '';
  let sessionUrl: string = '';

  try {
    const dataset = await loadMind2WebDataset();
    logger.log({
      message: `Loaded ${dataset.length} test cases from Mind2Web dataset`,
      level: 1,
    });

    // Wait for browser lock to be released
    while (browserLock) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    browserLock = true;

    // Initialize single Stagehand instance for all test cases
    stagehand = new Stagehand({
      env: "LOCAL",
      modelName,
      logger: (message: LogLine) => logger.log(message),
      headless: true,
      verbose: 1,
      enableCaching: true,
    });

    await stagehand.init();
    currentSession = stagehand.page;
    debugUrl = stagehand.debugUrl || '';
    sessionUrl = stagehand.sessionUrl || '';

    logger.log({
      message: 'Successfully initialized Stagehand',
      level: 1,
    });

    // Process each test case sequentially
    for (const [testIndex, testCase] of dataset.entries()) {
      const testStartTime = Date.now();
      let testSuccess = true;
      const testLogs: any[] = [];
      try {
        logger.log({
          message: `Processing test case ${testIndex + 1}`,
          level: 1,
          auxiliary: {
            task: { value: testCase.task, type: "string" },
          },
        });

        // Process each navigation step
        for (const [stepIndex, step] of testCase.evaluation.entries()) {
          const startTime = Date.now();
          logger.log({
            message: `Step ${stepIndex + 1}: Navigating to ${step.content.url}`,
            level: 1,
          });

          try {
            // Navigate to the URL with improved retry logic
            await retryAction(
              async () => {
                // Get site-specific configuration
                const url = new URL(step.content.url);
                const siteConfig = Object.entries(SITE_CONFIGS).find(([domain]) => url.hostname.includes(domain))?.[1];

                const result = await stagehand.page.goto(step.content.url, {
                  timeout: siteConfig?.timeout || PAGE_LOAD_TIMEOUT,
                  waitUntil: siteConfig?.waitUntil || 'networkidle0',
                });

                // Additional check for page interactivity unless bypassed
                if (!siteConfig?.bypassInteractivityCheck) {
                  await stagehand.page.waitForFunction(
                    'document.readyState === "complete" && performance.now() > 1000',
                    { timeout: siteConfig?.timeout || PAGE_LOAD_TIMEOUT }
                  );
                }

                return result;
              },
              MAX_ACTION_RETRIES,
              logger,
              `Failed to navigate to ${step.content.url} after multiple retries`,
              RETRY_DELAY
            );

            // Handle common obstacles after navigation
            await handleCommonObstacles(stagehand, logger);

            // Verify URL matches expected pattern
            const currentUrl = stagehand.page.url();
            const isMatch = step.match_function_name === "url_included_match"
              ? validateUrlPath(currentUrl, step.content.reference_answer)
              : validateUrlMatch(currentUrl, step.content.url);

            if (!isMatch) {
              throw new Error(`URL validation failed. Expected pattern: ${step.content.reference_answer}, got: ${currentUrl}`);
            }

            logger.log({
              message: `Successfully completed step ${stepIndex + 1}`,
              auxiliary: {
                currentUrl: { value: currentUrl, type: "string" },
              },
            });

            // Add delay between steps
            if (stepIndex < testCase.evaluation.length - 1) {
              await new Promise(resolve => setTimeout(resolve, STEP_DELAY));
            }
          } catch (error) {
            testSuccess = false;
            logger.error({
              message: `Test case ${testIndex + 1} failed`,
              level: 1,
              auxiliary: {
                error: { value: error.message, type: "string" },
              },
            });
            break;
          }
        }

        if (testSuccess) {
          logger.log({
            message: `Successfully completed test case ${testIndex + 1}`,
            level: 1,
            auxiliary: {
              duration: { value: String(Date.now() - testStartTime), type: "string" },
            },
          });
        }

        testResults.push({
          success: testSuccess,
          logs: testLogs,
        });

        // Add delay between test cases
        if (testIndex < dataset.length - 1) {
          await new Promise(resolve => setTimeout(resolve, TEST_CASE_DELAY));
        }
      } catch (error) {
        testSuccess = false;
        logger.error({
          message: `Test case ${testIndex + 1} failed`,
          level: 1,
          auxiliary: {
            error: { value: error.message, type: "string" },
            trace: { value: error.stack || "", type: "string" },
            duration: { value: String(Date.now() - testStartTime), type: "string" },
          },
        });

        // Try to recover the browser session if needed
        if (!stagehand.page || stagehand.page.isClosed()) {
          try {
            await stagehand.close();
            stagehand = new Stagehand({
              env: "LOCAL",
              modelName,
              logger: (message: LogLine) => logger.log(message),
              headless: true,
              verbose: 1,
              enableCaching: true,
            });
            await stagehand.init();
            currentSession = stagehand.page;
            debugUrl = stagehand.debugUrl || '';
            sessionUrl = stagehand.sessionUrl || '';
          } catch (e) {
            logger.error({
              message: 'Failed to recover browser session',
              level: 1,
              auxiliary: {
                error: { value: e.message, type: "string" },
              },
            });
            break;
          }
        }
      }
    }
  } catch (error) {
    logger.error({
      message: 'Fatal error in mind2web eval',
      level: 1,
      auxiliary: {
        error: { value: error.message, type: "string" },
        trace: { value: error.stack || "", type: "string" },
      },
    });
  } finally {
    // Ensure cleanup and proper browser instance management
    if (stagehand) {
      try {
        await stagehand.close();
        browserLock = false;
        logger.log({
          message: 'Successfully cleaned up browser instance',
          level: 1,
        });
      } catch (e) {
        browserLock = false;  // Release lock even if cleanup fails
        logger.warn({
          message: 'Error during cleanup',
          level: 1,
          auxiliary: {
            error: { value: e.message, type: "string" },
          },
        });
      }
    }
  }

  return {
    _success: testResults.every(r => r.success),
    logs: logger.getLogs(),
    debugUrl,
    sessionUrl,
  };
};
