import type { ConstructorParams, LogLine } from "../../lib";

const StagehandConfig: ConstructorParams = {
  env: "LOCAL",

  // Only set these if environment variables are present
  apiKey: process.env.BROWSERBASE_API_KEY || undefined,
  projectId: process.env.BROWSERBASE_PROJECT_ID || undefined,

  verbose: 1,
  debugDom: true,
  headless: true,
  logger: (message: LogLine) => {
    console.log(`[stagehand::${message.category}] ${message.message}`);
  },
  domSettleTimeoutMs: 30_000,
  // Only populate browserbaseSessionCreateParams if a PROJECT_ID is set
  browserbaseSessionCreateParams: process.env.BROWSERBASE_PROJECT_ID
    ? { projectId: process.env.BROWSERBASE_PROJECT_ID }
    : undefined,

  enableCaching: false,
  browserbaseSessionID: undefined,
  // modelName: "gpt-4o",
  // modelClientOptions: {
  //   apiKey: process.env.OPENAI_API_KEY,
  // },
};

export default StagehandConfig;
