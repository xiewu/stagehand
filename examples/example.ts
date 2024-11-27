import { Stagehand } from "../lib";
import { z } from "zod";

async function example() {
  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    debugDom: false,
  });

  await stagehand.init({ modelName: "claude-3-5-sonnet-20241022" });

  // Navigate to Hacker News
  await stagehand.page.goto("https://www.zolve.com");
  await stagehand.act({
    action: "Close any visible popups or banners",
    useVision: false,
  });

  await new Promise((resolve) => setTimeout(resolve, 1000));
  const viewportHeight = await stagehand.page.evaluate(
    () => window.innerHeight,
  );
  let currentScrollPosition = 0;
  const totalHeight = await stagehand.page.evaluate(
    () => document.body.scrollHeight,
  );

  while (currentScrollPosition < totalHeight) {
    await stagehand.page.evaluate((scrollBy) => {
      window.scrollBy(0, scrollBy);
    }, viewportHeight);

    currentScrollPosition += viewportHeight;
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second between each scroll
  }
  await stagehand.page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await stagehand.page.setViewportSize({
    width: 1920,
    height: await stagehand.page.evaluate(() => document.body.scrollHeight),
  });
  await new Promise((resolve) => setTimeout(resolve, 1000));

  await stagehand.page.screenshot({ fullPage: true, path: "screenshot.png" });

  await new Promise((resolve) => setTimeout(resolve, 100000));

  await stagehand.context.close();
}

(async () => {
  await example();
})();
