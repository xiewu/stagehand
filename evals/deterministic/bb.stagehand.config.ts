import { default as DefaultStagehandConfig } from "@/stagehand.config";
import type { ConstructorParams } from "@/dist";
import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

if (!process.env.BROWSERBASE_PROJECT_ID) {
  throw new Error("BROWSERBASE_PROJECT_ID is not set");
}

if (!process.env.BROWSERBASE_API_KEY) {
  throw new Error("BROWSERBASE_API_KEY is not set");
}

const StagehandConfig: ConstructorParams = {
  ...DefaultStagehandConfig,
  env: "BROWSERBASE" /* Environment to run Stagehand in */,
  apiKey: process.env.BROWSERBASE_API_KEY,
  projectId: process.env.BROWSERBASE_PROJECT_ID,
  browserbaseSessionCreateParams: {
    projectId: process.env.BROWSERBASE_PROJECT_ID,
  },
};
export default StagehandConfig;
