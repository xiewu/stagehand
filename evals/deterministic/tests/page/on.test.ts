import { test } from "@playwright/test";
import { Stagehand } from "../../../../lib";
import StagehandConfig from "../../stagehand.config";

test.describe("StagehandPage - page.on()", () => {
  test("should navigate to the popup page and close it", async () => {
    const stagehand = new Stagehand(StagehandConfig);
    await stagehand.init();

    const stagehandPage = stagehand.page;
    await stagehandPage.goto(
      "https://docs.browserbase.com/integrations/crew-ai/introduction",
    );

    let clickPromise: Promise<void>;

    stagehandPage.on("popup", async (newPage) => {
      clickPromise = newPage.click(
        "body > div.page-wrapper > div.navbar-2.w-nav > div.padding-global.top-bot > div > div.navigation-left > nav > a:nth-child(7)",
      );
    });

    await stagehandPage.goto(
      "https://docs.browserbase.com/integrations/crew-ai/introduction",
    );

    await stagehandPage.click(
      "#content-area > div.relative.mt-8.prose.prose-gray.dark\\:prose-invert > p:nth-child(2) > a",
    );

    await clickPromise;

    await stagehandPage.waitForTimeout(5000);

    await stagehand.close();
  });
});
