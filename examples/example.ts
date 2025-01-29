/**
 * This file is meant to be used as a scratchpad for developing new evals.
 * To create a Stagehand project with best practices and configuration, run:
 *
 * npx create-browser-app@latest my-browser-app
 */


import { Stagehand } from "../lib/index";
import StagehandConfig from "../stagehand.config";
// import { OllamaClient } from "./external_clients/ollama";
import { AISdkClient } from "./external_clients/aisdk";
import { LangchainClient } from "./external_clients/langchain";

async function example() {

  // const stagehand = new Stagehand({
  //   ...StagehandConfig,
  //   llmClient: new AISdkClient({
  //     model: {
  //       modelId: "gpt-4o",
  //     },
  //   }),
  // });
  const stagehand = new Stagehand({
    ...StagehandConfig,
    llmClient: new LangchainClient({
      model: {
        modelId: "gpt-4o",
      },
    }),
  });
  console.log(stagehand.llmClient);
  
  await stagehand.init();
  

  await stagehand.page.goto("https://arxiv.org/search/");

  await stagehand.page.act(
    "search for papers about web agents with multimodal models",
  );

  await stagehand.close();
}

(async () => {
  await example();
})();
