/**
 * This file is meant to be used as a scratchpad for developing new evals.
 * To create a Stagehand project with best practices and configuration, run:
 *
 * npx create-browser-app@latest my-browser-app
 */

import { Stagehand } from "../lib";
import StagehandConfig from "./stagehand.config";

async function example() {
  const stagehand = new Stagehand(StagehandConfig);
  await stagehand.init();

  const page = stagehand.page;
  await page.goto("https://www.google.com");

  const actResult = await page.act(
    "type 'hello' into the search bar and press enter",
  );
  console.log(actResult);

  const { extraction } = await page.extract("extract the first result's title");
  console.log(extraction);

  const observeResult = await page.observe(
    "observe the possible actions on this page",
  );
  console.log(observeResult);

  await stagehand.close();
}

(async () => {
  await example();
})();
