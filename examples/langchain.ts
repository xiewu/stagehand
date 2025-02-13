import { z } from "zod";
import { Stagehand } from "@/dist";
import StagehandConfig from "@/stagehand.config";
import { LangchainClient } from "./external_clients/langchain";
import { ChatOpenAI } from "@langchain/openai";

async function example() {
  const stagehand = new Stagehand({
    ...StagehandConfig,
    llmClient: new LangchainClient(
      new ChatOpenAI({
        model: "gpt-4o",
      }),
    ),
  });

  await stagehand.init();
  await stagehand.page.goto("https://python.langchain.com/docs/introduction/");

  const observation1 = await stagehand.page.observe({
    instruction: "Go to Conceptual Guides section",
    returnAction: true,
  });
  if (observation1.length > 0) {
    await stagehand.page.act(observation1[0]);
  }

  await stagehand.page.waitForTimeout(1000);

  const observation2 = await stagehand.page.observe({
    instruction: "Click on 'Why LangChain?' located in the content of the page",
    returnAction: true,
  });
  if (observation2.length > 0) {
    await stagehand.page.act(observation2[0]);
  }

  await stagehand.page.waitForTimeout(1000);

  const observation4 = await stagehand.page.observe({
    instruction:
      "Find the work email input field and enter 'john.smith@acme.com'",
    returnAction: true,
  });
  if (observation4.length > 0) {
    await stagehand.page.act(observation4[0]);
  }

  await stagehand.page.waitForTimeout(1000);

  const observation5 = await stagehand.page.observe({
    instruction:
      "Find the job title input field and enter 'Engineering Manager'",
    returnAction: true,
  });
  if (observation5.length > 0) {
    await stagehand.page.act(observation5[0]);
  }

  const result = await stagehand.page.extract({
    instruction: "Extract the content of the page",
    schema: z.object({
      content: z.string(),
    }),
  });

  console.log(result);

  await stagehand.page.waitForTimeout(5000);

  await stagehand.close();
}

(async () => {
  await example();
})();
