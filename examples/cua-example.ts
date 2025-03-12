import { Stagehand } from "../lib";
// import { z } from "zod";
import dotenv from "dotenv";
import StagehandConfig from "../stagehand.config";

// Load environment variables
dotenv.config();

async function main() {
  console.log("🎭 Starting CUA Demo with Stagehand");

  // Initialize Stagehand
  console.log("🚀 Initializing Stagehand...");
  const stagehand = new Stagehand({
    ...StagehandConfig,
    env: "BROWSERBASE",
    llmProvider: undefined, // Override to prevent type conflict
    agentEnabled: true,
  });

  await stagehand.init();
  console.log("✅ Stagehand initialized");

  try {
    const page = stagehand.page;

    // Navigate to a website
    await page.goto("https://www.browserbase.com/careers");

    const agent = stagehand.agent({
      enabled: true,
      provider: "openai",
      model: "computer-use-preview-2025-02-04",
      instructions: `You are a helpful assistant that can use a web browser.
      You are currently on the following page: ${page.url()}.
      Do not ask follow up questions, the user will trust your judgement.`,
      options: {
        apiKey: process.env.OPENAI_API_KEY,
      },
    });
    const result = await agent.execute({
      instruction: "apply for the full-stack engineer position with mock data",
      maxSteps: 20,
    });

    console.log("✅ First agent execution complete");
    console.log("Result:", JSON.stringify(result, null, 2));

    // Navigate to another website
    console.log("🌐 Navigating to another website...");
    await stagehand.page.goto("https://www.google.com");
    console.log("✅ Navigation complete");

    // Execute the agent again with a different instruction
    console.log("🤖 Executing the agent again...");
    const result2 = await agent.execute(
      "Search for openai news on google and extract the first 3 results",
    );

    console.log("✅ Second agent execution complete");
    console.log("Result:", JSON.stringify(result2, null, 2));
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    // Close the browser
    console.log("🛑 Closing browser...");
    await stagehand.close();
    console.log("✅ Browser closed");
  }
}

main().catch(console.error);
