/**
 * This file provides utility functions and classes to assist with evaluation tasks.
 *
 * Key functionalities:
 * - Environment determination (BROWSERBASE or LOCAL)
 * - Initialization of Stagehand, the automation and modeling toolkit
 * - A custom evaluation logger (EvalLogger) that captures and processes log lines
 * - String normalization and fuzzy comparison utility functions to compare output strings
 *   against expected results in a flexible and robust way.
 */

import { AvailableModel, Stagehand } from "../lib";
import { logLineToString } from "../lib/utils";
import { LogLine } from "../types/log";
import stringComparison from "string-comparison";
const { jaroWinkler } = stringComparison;

/**
 * Determine the current environment in which the evaluations are running:
 * - BROWSERBASE: Typically a headless environment where tasks rely on browser automation.
 * - LOCAL: A local environment (e.g., developer machine) without special constraints.
 *
 * The environment is read from the EVAL_ENV environment variable.
 */
export const env: "BROWSERBASE" | "LOCAL" =
  process.env.EVAL_ENV?.toLowerCase() === "browserbase"
    ? "BROWSERBASE"
    : "LOCAL";

/**
 * Enable or disable caching based on the EVAL_ENABLE_CACHING environment variable.
 * Caching may improve performance by not re-fetching or re-computing certain results.
 * By default, caching is disabled unless explicitly enabled.
 */
const enableCaching = process.env.EVAL_ENABLE_CACHING?.toLowerCase() === "true";

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

/**
 * Extended log line type that includes parsed auxiliary data:
 *
 * LogLineEval augments LogLine by adding a `parsedAuxiliary` field,
 * which attempts to parse the auxiliary data (if present) into a more structured format.
 */
type LogLineEval = LogLine & {
  parsedAuxiliary?: string | object;
};

/**
 * parseLogLine:
 * Given a LogLine, attempts to parse its `auxiliary` field into a structured object.
 * If parsing fails, logs an error and returns the original line.
 *
 * The `auxiliary` field in the log line typically contains additional metadata about the log event.
 */
function parseLogLine(logLine: LogLine): LogLineEval {
  try {
    return {
      ...logLine,
      // Remove the original auxiliary field in favor of parsedAuxiliary
      auxiliary: undefined,
      parsedAuxiliary: logLine.auxiliary
        ? Object.fromEntries(
            Object.entries(logLine.auxiliary).map(([key, entry]) => [
              key,
              entry.type === "object" ? JSON.parse(entry.value) : entry.value,
            ]),
          )
        : undefined,
    } as LogLineEval;
  } catch (e) {
    console.log("Error parsing log line", logLine);
    console.error(e);
    return logLine;
  }
}

/**
 * EvalLogger:
 * A logger class used during evaluations to capture and print log lines.
 *
 * Capabilities:
 * - Maintains an internal array of log lines (EvalLogger.logs) for later retrieval.
 * - Can be initialized with a Stagehand instance to provide consistent logging.
 * - Supports logging at different levels (info, error, warn).
 * - Each log line is converted to a string and printed to console for immediate feedback.
 * - Also keeps a structured version of the logs that can be returned for analysis or
 *   included in evaluation output.
 */
export class EvalLogger {
  logs: LogLineEval[] = [];
  stagehand?: Stagehand;

  constructor() {}

  /**
   * init:
   * Associates this logger with a given Stagehand instance.
   * This allows the logger to provide additional context if needed.
   */
  init(stagehand: Stagehand) {
    this.stagehand = stagehand;
  }

  /**
   * log:
   * Logs a message at the default (info) level.
   * Uses `logLineToString` to produce a readable output on the console,
   * and then stores the parsed log line in `this.logs`.
   */
  log(logLine: LogLine) {
    console.log(logLineToString(logLine));
    this.logs.push(parseLogLine(logLine));
  }

  /**
   * error:
   * Logs an error message with `console.error` and stores it.
   * Useful for capturing and differentiating error-level logs.
   */
  error(logLine: LogLine) {
    console.error(logLineToString(logLine));
    this.logs.push(parseLogLine(logLine));
  }

  /**
   * warn:
   * Logs a warning message with `console.warn` and stores it.
   * Helps differentiate warnings from regular info logs.
   */
  warn(logLine: LogLine) {
    console.warn(logLineToString(logLine));
    this.logs.push(parseLogLine(logLine));
  }

  /**
   * getLogs:
   * Retrieves the array of stored log lines.
   * Useful for returning logs after a task completes, for analysis or debugging.
   */
  getLogs() {
    return this.logs;
  }
}

/**
 * normalizeString:
 * Prepares a string for comparison by:
 * - Converting to lowercase
 * - Collapsing multiple spaces to a single space
 * - Removing punctuation and special characters that are not alphabetic or numeric
 * - Normalizing spacing around commas
 * - Trimming leading and trailing whitespace
 *
 * This helps create a stable string representation to compare against expected outputs,
 * even if the actual output contains minor formatting differences.
 */
export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[;/#!$%^&*:{}=\-_`~()]/g, "")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

/**
 * compareStrings:
 * Compares two strings (actual vs. expected) using a similarity metric (Jaro-Winkler).
 *
 * Arguments:
 * - actual: The actual output string to be checked.
 * - expected: The expected string we want to match against.
 * - similarityThreshold: A number between 0 and 1. Default is 0.85.
 *   If the computed similarity is greater than or equal to this threshold,
 *   we consider the strings sufficiently similar.
 *
 * Returns:
 * - similarity: A number indicating how similar the two strings are.
 * - meetsThreshold: A boolean indicating if the similarity meets or exceeds the threshold.
 *
 * This function is useful for tasks where exact string matching is too strict,
 * allowing for fuzzy matching that tolerates minor differences in formatting or spelling.
 */
export function compareStrings(
  actual: string,
  expected: string,
  similarityThreshold: number = 0.85,
): { similarity: number; meetsThreshold: boolean } {
  const similarity = jaroWinkler.similarity(
    normalizeString(actual),
    normalizeString(expected),
  );
  return {
    similarity,
    meetsThreshold: similarity >= similarityThreshold,
  };
}


/**
 * generateTimestamp:
 * Generates a timestamp string formatted as "YYYYMMDDHHMMSS".
 * Used to create unique experiment names, ensuring that results can be
 * distinguished by the time they were generated.
 */
export function generateTimestamp(): {timestamp: string} {
  const now = new Date();
  return now
    .toISOString()
    .replace(/[-:TZ]/g, "")
    .slice(0, 14);
}


/**
 * generateExperimentName:
 * Creates a unique name for the experiment based on optional evalName or category,
 * the environment (e.g., dev or CI), and the current timestamp.
 * This is used to label the output files and directories.
 */
export function generateExperimentName({
  evalName,
  category,
  environment,
}: {
  evalName?: string;
  category?: string;
  environment: string;
}): {experimentName: string} {
  const timestamp = generateTimestamp();
  if (evalName) {
    return `${evalName}_${environment.toLowerCase()}_${timestamp}`;
  }
  if (category) {
    return `${category}_${environment.toLowerCase()}_${timestamp}`;
  }
  return `all_${environment.toLowerCase()}_${timestamp}`;
}