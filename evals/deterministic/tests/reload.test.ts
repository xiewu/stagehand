import { test, expect } from "@playwright/test";
import { Stagehand } from "../../../lib";
import StagehandConfig from "../stagehand.config";

test.describe("StagehandPage - Reload", () => {
  test("should reload the page and reset page state", async () => {
    const stagehand = new Stagehand(StagehandConfig);
    await stagehand.init();

    const page = stagehand.page;

    await page.goto("https://www.browserbase.com/");

    await page.evaluate(() => {
      window.__testReloadMarker = "Hello Reload!";
    });

    const markerBeforeReload = await page.evaluate(() => {
      return window.__testReloadMarker;
    });
    expect(markerBeforeReload).toBe("Hello Reload!");

    await page.reload();

    const markerAfterReload = await page.evaluate(() => {
      return window.__testReloadMarker;
    });
    expect(markerAfterReload).toBeUndefined();

    await stagehand.close();
  });
});
