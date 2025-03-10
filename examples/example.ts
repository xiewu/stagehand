/**
 * This file is meant to be used as a scratchpad for developing new evals.
 * To create a Stagehand project with best practices and configuration, run:
 *
 * npx create-browser-app@latest my-browser-app
 */

import { Stagehand } from "@/dist";
import StagehandConfig from "@/stagehand.config";
import { Browserbase } from "@browserbasehq/sdk";
async function example() {
  const browserbase = new Browserbase();
  const session = await browserbase.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID,
  });
  const stagehand = new Stagehand({
    ...StagehandConfig,
    browserbaseSessionID: session.id,
  });
  await stagehand.init();

  await stagehand.page.goto("https://docs.stagehand.dev");

  /**
   * Add your code here!
   */
  await stagehand.close();
}

(async () => {
  await example();
})();
