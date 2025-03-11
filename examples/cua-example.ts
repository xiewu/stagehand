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
    // Ensure we have agent configuration
    agent: {
      enabled: true,
      provider: "anthropic",
      model: "claude-3-7-sonnet-20250219",
      instructions:
        "You are a helpful assistant that can use the computer to help the user accomplish tasks in a web browser.",
      options: {
        apiKey: process.env.ANTHROPIC_API_KEY,
      },
    },
  });

  await stagehand.init();
  console.log("✅ Stagehand initialized");

  try {
    // Navigate to a website
    console.log("🌐 Navigating to a website...");
    await stagehand.page.goto("https://www.browserbase.com/careers");
    console.log("✅ Navigation complete");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Create an agent instance
    console.log("🤖 Creating an agent instance...");
    const agent = stagehand.agent();

    // Execute the agent with an instruction
    console.log("🤖 Executing the agent...");
    const result = await agent.execute({
      instruction:
        "click on the first job posting and complete the application form with mock data, don't submit it, just fill the form. Please don't ask follow up questions, I trust your judgement.",
      maxSteps: 10,
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
