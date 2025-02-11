/**
 * This file is meant to be used as a scratchpad for developing new evals.
 * To create a Stagehand project with best practices and configuration, run:
 *
 * npx create-browser-app@latest my-browser-app
 */


import { Stagehand } from "../lib/index";
import StagehandConfig from "../stagehand.config";
import { OllamaClient } from "./external_clients/ollama";
import { AISdkClient } from "./external_clients/aisdk";
import { LangchainClient } from "./external_clients/langchain";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
async function example() {

  // below is ollama config - works
  // const stagehand = new Stagehand({
  //   ...StagehandConfig,
  //   llmClient: new OllamaClient({
  //     modelName: "llama3.2",
  //   }),
  // });

  // below is aisdk config - works
  // const stagehand = new Stagehand({
  //   ...StagehandConfig,
  //   llmClient: new AISdkClient({
  //     model: openai("gpt-4o"),
  //   }),
  // });

  // below is langchain config - works except observe
  const stagehand = new Stagehand({
    ...StagehandConfig,
    llmClient: new LangchainClient({
      modelName: StagehandConfig.modelName,
      apiKey: StagehandConfig.modelClientOptions.apiKey,
    }),
  });

  // below is native stagehand config - works
  // const config = {
  //   ...StagehandConfig,
  //   modelName: StagehandConfig.modelName,
  //   modelClientOptions: {
  //     apiKey: StagehandConfig.modelClientOptions.apiKey,
  //   },
  // };

  // const stagehand = new Stagehand(config);

  console.log(stagehand.llmClient);
  
  await stagehand.init();
  
  await stagehand.page.goto("https://arxiv.org/search/");

  await stagehand.page.act(
    "search for papers about web agents with multimodal models",
  );
  // await stagehand.page.goto("https://news.ycombinator.com");

  // const headlines = await stagehand.page.extract({
  //   instruction: "Extract only 3 stories from the Hacker News homepage.",
  //   schema: z.object({
  //     stories: z
  //       .array(
  //         z.object({
  //           title: z.string(),
  //           url: z.string(),
  //           points: z.number(),
  //         }),
  //       )
  //       .length(3),
  //   }),
  // });

  // console.log(headlines);

  // const observations = await stagehand.page.observe({
  //   instruction: "what is the top story on the page?",
  // });
  // console.log(observations);

  await stagehand.close();
}

(async () => {
  await example();
})();
