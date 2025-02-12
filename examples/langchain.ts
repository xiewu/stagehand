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

  await stagehand.init();

  await stagehand.page.goto("https://docs.stagehand.dev/get_started/introduction");

  const observed = await stagehand.page.observe({
    instruction:
      "find the search bar with placeholder 'Search or ask...' and click it",
    onlyVisible: false,
    returnAction: true,
  });

  await stagehand.page.waitForTimeout(1000);

  await stagehand.page.act(observed[0]);

  await stagehand.page.act("Fill the search bar with the word 'Langchain'");

  await stagehand.page.waitForTimeout(1000);

  await stagehand.page.act("Click the second option in the dropdown");

  await stagehand.page.waitForTimeout(1000);

  const headlines = await stagehand.page.extract({
    instruction: "Extract the title, and the whole section on Using LangGraph Agents.",
    schema: z.object({
      title: z.string(),
      summary: z.string(),
    }),
  });

  console.log(headlines);

  await stagehand.close();
}

(async () => {
  await example();
})();
