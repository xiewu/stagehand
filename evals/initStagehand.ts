/**
 * This file provides a function to initialize a Stagehand instance for use in evaluations.
 * It configures the Stagehand environment and sets default options based on the current environment
 * (e.g., local or BROWSERBASE), caching preferences, and verbosity. It also establishes a logger for
 * capturing logs emitted by Stagehand.
 *
 * The primary function exported by this file (`initStagehand`) takes in the model name, an optional
 * DOM settling timeout, and an EvalLogger instance. It then:
 * - Instantiates a Stagehand object with the provided configuration.
 * - Associates the EvalLogger with the Stagehand instance to ensure that all logs are captured.
 * - Initializes Stagehand, which may involve tasks like launching a browser or preparing the
 *   model environment.
 *
 * Once initialized, it returns the Stagehand instance, the logger, and any response data returned by
 * the initialization process. Other parts of the evaluation framework can then use the returned
 * `stagehand` and `logger` to interact with web pages, run tasks, and collect logs.
 */

import { enableCaching, env } from "./env";
import { AvailableModel, LogLine, Stagehand } from "../lib";
import { EvalLogger } from "./logger";

/**
 * Default options passed to the Stagehand constructor:
 * - env: The current environment determined above
 * - headless: Whether to run headless (no UI). Defaults to false.
 * - verbose: Verbosity level (2 indicates more detailed logging)
 * - debugDom: Whether to show DOM debugging information
 * - enableCaching: Whether to enable caching of resources
 */
const defaultStagehandOptions = {
  env,
  headless: false,
  verbose: 2 as const,
  debugDom: true,
  enableCaching,
};

/**
 * Initializes a Stagehand instance for a given model:
 * - modelName: The model to use (e.g., GPT variant, Claude variant)
 * - domSettleTimeoutMs: Optional timeout for DOM settling operations (useful for browser-based tasks)
 * - logger: An EvalLogger instance to record logs from Stagehand
 *
 * Returns an object containing:
 * - stagehand: The initialized Stagehand instance
 * - logger: The provided logger, now associated with the Stagehand instance
 * - initResponse: Any response data returned by Stagehand initialization
 */
export const initStagehand = async ({
  modelName,
  domSettleTimeoutMs,
  logger,
}: {
  modelName: AvailableModel;
  domSettleTimeoutMs?: number;
  logger: EvalLogger;
}) => {
  const stagehand = new Stagehand({
    ...defaultStagehandOptions,
    modelName,
    domSettleTimeoutMs,
    logger: (logLine: LogLine) => {
      // Every log line from Stagehand is passed into our EvalLogger instance
      logger.log(logLine);
    },
  });

  // Associate the logger with the Stagehand instance
  logger.init(stagehand);

  // Perform Stagehand initialization (e.g., starting a browser, setting up model interface)
  const initResponse = await stagehand.init();
  return { stagehand, logger, initResponse };
};
