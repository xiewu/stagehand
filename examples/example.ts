/**
 * This file is meant to be used as a scratchpad for developing new evals.
 * To create a Stagehand project with best practices and configuration, run:
 *
 * npx create-browser-app@latest my-browser-app
 */

import { BrowserContext, Page, Stagehand } from "../lib";
import StagehandConfig from "./stagehand.config";

async function main({
  stagehand,
  page,
  context,
}: {
  stagehand: Stagehand;
  page: Page;
  context: BrowserContext;
}) {
  /**
   * Add your Stagehand code here
   *
   * This code is .gitignored, so you can use it as a scratchpad for developing new evals
   */
}

/**
 * This is the entrypoint for the script if run via npm run example
 */
async function run() {
  const stagehand = new Stagehand(StagehandConfig);
  await stagehand.init();
  const { page, context } = await stagehand;
  await main({ stagehand, page, context });
  await stagehand.close();
}

if (require.main === module) {
  run();
}
