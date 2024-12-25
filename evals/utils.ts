import { Stagehand } from "../lib";
import { logLineToString } from "../lib/utils";
import { LogLine } from "../types/log";
import { AvailableModelSchema } from "../types/model";
import { ConstructorParams } from "../types/stagehand";
import { z } from "zod";
import stringComparison from "string-comparison";
const { jaroWinkler } = stringComparison;

export const env: "BROWSERBASE" | "LOCAL" =
  process.env.EVAL_ENV?.toLowerCase() === "browserbase"
    ? "BROWSERBASE"
    : "LOCAL";

const enableCaching = process.env.EVAL_ENABLE_CACHING?.toLowerCase() === "true";

const defaultStagehandOptions: Omit<
  ConstructorParams,
  "modelName" | "domSettleTimeoutMs" | "logger"
> = {
  env,
  headless: false,
  verbose: 2 as const,
  debugDom: true,
  enableCaching,
  browserbaseSessionCreateParams: {
    projectId: "stagehand-dev",
    browserSettings: {
      viewport: { width: 1280, height: 720 },
      fingerprint: {
        httpVersion: 2,
        browsers: ["chrome"],
        devices: ["desktop"],
        operatingSystems: ["linux"],
      },
    },
  },
};

export const initStagehand = async ({
  modelName,
  domSettleTimeoutMs,
  logger,
}: {
  modelName: z.infer<typeof AvailableModelSchema>;
  domSettleTimeoutMs?: number;
  logger: EvalLogger;
}) => {
  const stagehand = new Stagehand({
    ...defaultStagehandOptions,
    modelName: modelName as z.infer<typeof AvailableModelSchema>,
    domSettleTimeoutMs,
    logger: (logLine: LogLine) => {
      logger.log(logLine);
    },
  } as ConstructorParams);
  logger.init(stagehand);
  const initResponse = await stagehand.init();
  return { stagehand, logger, initResponse };
};

type LogLineEval = LogLine & {
  parsedAuxiliary?: string | object;
};

function parseLogLine(logLine: LogLine): LogLineEval {
  try {
    return {
      ...logLine,
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

export class EvalLogger {
  logs: LogLineEval[] = [];
  stagehand?: Stagehand;

  constructor() {}

  init(stagehand: Stagehand) {
    this.stagehand = stagehand;
  }

  log(logLine: LogLine) {
    console.log(logLineToString(logLine));
    this.logs.push(parseLogLine(logLine));
  }

  error(logLine: LogLine) {
    console.error(logLineToString(logLine));
    this.logs.push(parseLogLine(logLine));
  }

  warn(logLine: LogLine) {
    console.warn(logLineToString(logLine));
    this.logs.push(parseLogLine(logLine));
  }

  getLogs() {
    return this.logs;
  }
}

export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[;/#!$%^&*:{}=\-_`~()]/g, "")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

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
