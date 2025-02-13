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
  await stagehand.page.goto("https://www.langchain.com/contact-sales");

  // First name
  const observation1 = await stagehand.page.observe({
    instruction: "Find the first name input field and enter 'John'",
    returnAction: true,
  });
  if (observation1.length > 0) {
    await stagehand.page.act(observation1[0]);
  }

  await stagehand.page.waitForTimeout(1000);

  // Last name
  const observation2 = await stagehand.page.observe({
    instruction: "Find the last name input field and enter 'Smith'",
    returnAction: true,
  });
  if (observation2.length > 0) {
    await stagehand.page.act(observation2[0]);
  }

  await stagehand.page.waitForTimeout(1000);

  // Company
  const observation3 = await stagehand.page.observe({
    instruction: "Find the company name input field and enter 'Acme Corp'",
    returnAction: true,
  });
  if (observation3.length > 0) {
    await stagehand.page.act(observation3[0]);
  }

  await stagehand.page.waitForTimeout(1000);

  // Email
  const observation4 = await stagehand.page.observe({
    instruction:
      "Find the work email input field and enter 'john.smith@acme.com'",
    returnAction: true,
  });
  if (observation4.length > 0) {
    await stagehand.page.act(observation4[0]);
  }

  await stagehand.page.waitForTimeout(1000);

  // Job Title
  const observation5 = await stagehand.page.observe({
    instruction:
      "Find the job title input field and enter 'Engineering Manager'",
    returnAction: true,
  });
  if (observation5.length > 0) {
    await stagehand.page.act(observation5[0]);
  }

  await stagehand.page.waitForTimeout(1000);

  // Which products are you interested in?
  const observation6 = await stagehand.page.observe({
    instruction:
      "Find the which products are you interested in? options and select 'LangChain'",
    returnAction: true,
  });
  if (observation6.length > 0) {
    await stagehand.page.act(observation6[0]);
  }
  // Company Size
  const observation7 = await stagehand.page.observe({
    instruction:
      "Find and click the label element with text '21-100' in the 'Company Size' section. Look for a <label> element containing this text.",
    returnAction: true,
  });
  if (observation7.length > 0) {
    await stagehand.page.act(observation7[0]);
  }

  await stagehand.page.waitForTimeout(1000);

  // Company Global Headquarters
  const observation8 = await stagehand.page.observe({
    instruction:
      "Find and click the label element with text 'NA - West Coast' in the 'Company Global Headquarters' section. Look for a <label> element containing this text.",
    returnAction: true,
  });
  console.log(observation8);
  if (observation8.length > 0) {
    await stagehand.page.act(observation8[0]);
  }

  await stagehand.page.waitForTimeout(1000);

  // Submit Button
  const observation9 = await stagehand.page.observe({
    instruction:
      "Find the submit button with value 'Submit →'. The button may be disabled initially, but ignore that. Look for an input element of type 'submit' with class 'button is-form w-button'",
    returnAction: true,
  });
  console.log(observation9);

  await stagehand.page.waitForTimeout(5000);

  await stagehand.close();
}

(async () => {
  await example();
})();
