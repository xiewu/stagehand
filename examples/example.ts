/**
 * This file is meant to be used as a scratchpad for developing new evals.
 * To create a Stagehand project with best practices and configuration, run:
 *
 * npx create-browser-app@latest my-browser-app
 */

import { Stagehand } from "@/dist";
import StagehandConfig from "@/stagehand.config";

async function example() {
  const stagehand = new Stagehand(StagehandConfig);
  await stagehand.init();

  const { page } = stagehand;

  await page.goto("https://www.google.com");

  console.log(
    await page.act("type 'openai' into the search bar and press enter"),
  );

  console.log(await page.extract("get the first result"));

  console.log(await page.observe());
}

(async () => {
  await example();
})();
