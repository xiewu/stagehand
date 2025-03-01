/**
 * This file is meant to be used as a scratchpad for developing new evals.
 * To create a Stagehand project with best practices and configuration, run:
 *
 * npx create-browser-app@latest my-browser-app
 */

import { AvailableModel, Stagehand } from "@/dist";
import StagehandConfig from "@/stagehand.config";

async function example() {
  const stagehand = new Stagehand({
    ...StagehandConfig,
    modelName: "braintrust-gpt-4o" as AvailableModel,
    modelClientOptions: {
      apiKey: process.env.BRAINTRUST_API_KEY,
    },
  });
  await stagehand.init();
  await stagehand.page.goto("https://docs.stagehand.dev");
  await stagehand.page.act("click the quickstart");
}

(async () => {
  await example();
})();
