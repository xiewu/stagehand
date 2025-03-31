/**
 * This file is meant to be used as a scratchpad for developing new evals.
 * To create a Stagehand project with best practices and configuration, run:
 *
 * npx create-browser-app@latest my-browser-app
 */

import { Stagehand } from "@/dist";
import StagehandConfig from "@/stagehand.config";
import { z } from "zod";

async function example() {
  const stagehand = new Stagehand({
    ...StagehandConfig,
  });
  await stagehand.init();
  const page = stagehand.page;
  await page.goto("https://github.com/browserbase");

  // Use Stagehand's act() to control the page
  const [result] = await page.observe({
    instruction: "click on the stagehand repo",
    drawOverlay: true,
  });
  await page.act(result);

  // Use Computer Use agents with one line of code
  // These are useful for actions that are a series of steps
  const agent = stagehand.agent({
    provider: "openai",
    model: "computer-use-preview",
  });
  await agent.execute("Get to the latest PR");

  // Use Stagehand's extract() to extract data from the page
  const { author, title } = await page.extract({
    instruction: "extract the author and title of the PR",
    schema: z.object({
      author: z.string().describe("The username of the PR author"),
      title: z.string().describe("The title of the PR"),
    }),
  });
  console.log(`Author: ${author}`);
  console.log(`Title: ${title}`);
  await stagehand.close();
}

(async () => {
  await example();
})();
