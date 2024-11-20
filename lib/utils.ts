import crypto from "crypto";
import { LogLine } from "./types";

export function generateId(operation: string) {
  return crypto.createHash("sha256").update(operation).digest("hex");
}

export function logLineToString(logLine: LogLine): string {
  const timestamp = logLine.timestamp || new Date().toISOString();
  return `${timestamp}::[stagehand:${logLine.category}] ${logLine.message} ${
    logLine.auxiliary ? JSON.stringify(logLine.auxiliary) : ""
  }`;
}
