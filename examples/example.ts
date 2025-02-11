/**
 * This file is meant to be used as a scratchpad for developing new evals.
 * To create a Stagehand project with best practices and configuration, run:
 *
 * npx create-browser-app@latest my-browser-app
 */

import { Stagehand } from "../lib/index";
import StagehandConfig from "../stagehand.config";
import { LangchainClient } from "./external_clients/langchain";
import { z } from "zod";

async function example() {
  const stagehand = new Stagehand({
    env: "LOCAL",
    debugDom: true,
    enableCaching: false,
    llmClient: new LangchainClient({
      modelName: StagehandConfig.modelName,
      apiKey: StagehandConfig.modelClientOptions.apiKey,
    }),
  });

  console.log(
    "stagehand.llmProvider.getClient(StagehandConfig.modelName)",
    stagehand.llmProvider.getClient(StagehandConfig.modelName),
  );

  await stagehand.init();

  await stagehand.page.goto("https://arxiv.org/search/");

  const observed = await stagehand.page.observe({
    instruction:
      "find the search bar with placeholder 'search term...' and fill it with the word 'hello'",
    onlyVisible: false,
    returnAction: true,
  });
  console.log(observed);

  await stagehand.page.act(observed[0]);

  await stagehand.page.waitForTimeout(1000);

  await stagehand.page.goto("https://news.ycombinator.com");

  const headlines = await stagehand.page.extract({
    instruction: "Extract only 3 stories from the Hacker News homepage.",
    schema: z.object({
      stories: z.array(
        z.object({
          title: z.string(),
          url: z.string(),
          points: z.number(),
        }),
      ),
    }),
  });
  console.log(headlines.stories);

  await stagehand.page.act("click the first story");

  await new Promise((resolve) => setTimeout(resolve, 10000));

  await stagehand.close();
}

(async () => {
  await example();
})();
