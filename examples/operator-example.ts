import { Stagehand } from "@/dist";
import dotenv from "dotenv";
import StagehandConfig from "@/stagehand.config";
import chalk from "chalk";

// Load environment variables
dotenv.config();

async function main() {
  console.log(`\n${chalk.bold("Stagehand 🤘 Native Agent Example")}\n`);

  // Initialize Stagehand
  console.log(`${chalk.cyan("→")} Initializing Stagehand...`);
  const stagehand = new Stagehand({
    ...StagehandConfig,
  });

  await stagehand.init();
  console.log(`${chalk.green("✓")} Stagehand initialized`);

  try {
    const page = stagehand.page;

    console.log(`\n${chalk.magenta.bold("⚡ First Agent Execution")}`);

    const agent = stagehand.agent({
      instructions: `You are a helpful assistant that can use a web browser.
      You are currently on the following page: ${page.url()}.
      Do not ask follow up questions, the user will trust your judgement.`,
    });

    console.log(`${chalk.yellow("→")} Navigating to Google...`);
    await stagehand.page.goto("https://www.google.com");
    console.log(`${chalk.green("✓")} Loaded: ${chalk.dim(page.url())}`);

    // Execute the agent again with a different instruction
    const firstInstruction =
      "Search for openai news on google and extract the name of the first 3 results";
    console.log(
      `${chalk.cyan("↳")} Instruction: ${chalk.white(firstInstruction)}`,
    );

    const result1 = await agent.execute(firstInstruction);

    console.log(`${chalk.green("✓")} Execution complete`);
    console.log(`${chalk.yellow("⤷")} Result:`);
    console.log(chalk.white(JSON.stringify(result1, null, 2)));

    console.log(`\n${chalk.magenta.bold("⚡ Second Agent Execution")}`);

    console.log(`\n${chalk.yellow("→")} Navigating to Apple...`);
    await page.goto("https://www.apple.com/shop/buy-mac/macbook-air");
    console.log(`${chalk.green("✓")} Loaded: ${chalk.dim(page.url())}`);

    const instruction =
      "Add a macbook air to the cart. Choose the most expensive configuration.";
    console.log(`${chalk.cyan("↳")} Instruction: ${chalk.white(instruction)}`);

    const result = await agent.execute({
      instruction,
      maxSteps: 20,
    });

    console.log(`${chalk.green("✓")} Execution complete`);
    console.log(`${chalk.yellow("⤷")} Result:`);
    console.log(chalk.white(JSON.stringify(result, null, 2)));
  } catch (error) {
    console.log(`${chalk.red("✗")} Error: ${error}`);
    if (error instanceof Error && error.stack) {
      console.log(chalk.dim(error.stack.split("\n").slice(1).join("\n")));
    }
  } finally {
    // Close the browser
    console.log(`\n${chalk.yellow("→")} Closing browser...`);
    await stagehand.close();
    console.log(`${chalk.green("✓")} Browser closed\n`);
  }
}

main().catch((error) => {
  console.log(`${chalk.red("✗")} Unhandled error in main function`);
  console.log(chalk.red(error));
});
