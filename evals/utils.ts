import { LogLine } from "../lib/types";
import { Stagehand } from "../lib";
import { logLineToString } from "../lib/utils";

type LogLineEval = LogLine & {
  parsedAuxiliary?: string | object;
};

function parseLogLine(logLine: LogLine): LogLineEval {
  return {
    ...logLine,
    parsedAuxiliary:
      logLine.auxiliary &&
      logLine.auxiliary.value &&
      (logLine.auxiliary.type as unknown as string) === "object"
        ? JSON.parse(logLine.auxiliary.value as unknown as string)
        : logLine.auxiliary?.value,
  } as LogLineEval;
}

export class EvalLogger {
  logs: LogLine[] = [];
  stagehand?: Stagehand;

  constructor() {}

  init(stagehand: Stagehand) {
    this.stagehand = stagehand;
  }

  log(logLine: LogLine) {
    console.log(logLineToString(logLine));
    this.logs.push(logLine);
  }

  error(logLine: LogLine) {
    console.error(logLineToString(logLine));
    this.logs.push(logLine);
  }

  warn(logLine: LogLine) {
    console.warn(logLineToString(logLine));
    this.logs.push(logLine);
  }

  getLogs() {
    return this.logs;
  }
}
