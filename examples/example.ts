import { Stagehand } from "../lib";
import { z } from "zod";

async function example() {
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    debugDom: true,
    enableCaching: false,
  });

  await stagehand.init();
  await stagehand.page.goto("https://github.com/browserbase/stagehand");
  await stagehand.act({ action: "click on the contributors" });
  const contributor = await stagehand.extract({
    instruction: "extract the top contributor",
    schema: z.object({
      username: z.string(),
      url: z.string(),
    }),
    domSettleTimeoutMs: 60000, // wait up to 60 seconds for the page to load, contributors can sometimes take a while to load
  });
  console.log(`Our favorite contributor is ${contributor.username}`);
}

(async () => {
  await example();
})();
