import { default as DefaultStagehandConfig } from "@/stagehand.config";
import type { ConstructorParams } from "@/dist";
import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

const StagehandConfig: ConstructorParams = {
  ...DefaultStagehandConfig,
  env: "LOCAL" /* Environment to run Stagehand in */,
  localBrowserLaunchOptions: {
    headless: true,
  },
};
export default StagehandConfig;
