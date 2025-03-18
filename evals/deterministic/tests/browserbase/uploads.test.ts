import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { Stagehand } from "@/dist";
import StagehandConfig from "@/evals/deterministic/stagehand.config";

test.describe("Playwright Upload", () => {
  let stagehand: Stagehand;

  test.beforeAll(async () => {
    stagehand = new Stagehand(StagehandConfig);
    await stagehand.init();
  });

  test.afterAll(async () => {
    await stagehand.close();
  });

  test("uploads a file", async () => {
    const page = stagehand.page;
    await page.goto("https://browser-tests-alpha.vercel.app/api/upload-test");

    const [fileChooser] = await Promise.all([
      page.waitForFileChooser(),
      page.click("#fileUpload"),
    ]);
    await fileChooser.accept([
      join(__dirname, "../..", "auxiliary", "logo.png"),
    ]);

    const fileNameSpan = await page.$("#fileName");
    const fileName = await fileNameSpan.evaluate((el) => el.textContent);

    const fileSizeSpan = await page.$("#fileSize");
    const fileSize = Number(
      await fileSizeSpan.evaluate((el) => el.textContent),
    );

    expect(fileName).toBe("logo.png");
    expect(fileSize).toBeGreaterThan(0);
  });
});
