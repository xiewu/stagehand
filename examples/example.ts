/**
 * This file is meant to be used as a scratchpad for developing new evals.
 * To create a Stagehand project with best practices and configuration, run:
 *
 * npx create-browser-app@latest my-browser-app
 */

import { Stagehand } from "@/dist";
import StagehandConfig from "@/stagehand.config";

async function example() {
  const stagehand = new Stagehand({
    ...StagehandConfig,
    modelName: "gpt-4o-2024-11-20",
    env: "LOCAL",
  });
  await stagehand.init();
  await stagehand.page.goto("https://www.google.com");
  await stagehand.page.act("type 'browserbase' into the search bar");
  await stagehand.page.act("click the search button");
}

(async () => {
  await example();
})();
