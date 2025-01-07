import { z } from "zod";
import { type ConstructorParams, type LogLine, Stagehand } from "../lib";
import { AISdkClient } from "./external_clients/aisdk";
import { openai } from "@ai-sdk/openai";

const StagehandConfig: ConstructorParams = {
  env: "BROWSERBASE",
  apiKey: process.env.BROWSERBASE_API_KEY,
  projectId: process.env.BROWSERBASE_PROJECT_ID,
  verbose: 1,
  llmClient: new AISdkClient(
    (message: LogLine) =>
      console.log(`[stagehand::${message.category}] ${message.message}`),
    openai("gpt-4o"),
  ),
  debugDom: true,
};

async function example() {
  const stagehand = new Stagehand(StagehandConfig);

  await stagehand.init();
  await stagehand.page.goto("https://news.ycombinator.com");

  const headlines = await stagehand.page.extract({
    instruction: "Extract only 3 stories from the Hacker News homepage.",
    schema: z.object({
      stories: z
        .array(
          z.object({
            title: z.string(),
            url: z.string(),
            points: z.number(),
          }),
        )
        .length(3),
    }),
  });

  console.log(headlines);

  await stagehand.close();
}

(async () => {
  await example();
})();
