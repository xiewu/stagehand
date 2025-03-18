import { test, expect } from "@playwright/test";
import { Stagehand } from "@/dist";
import StagehandConfig from "@/evals/deterministic/stagehand.config";

test.describe("StagehandContext - addInitScript", () => {
  test("should inject a script on the context before pages load", async () => {
    const stagehand = new Stagehand(StagehandConfig);
    await stagehand.init();

    const page = stagehand.page;
    const context = stagehand.context;

    await page.evaluateOnNewDocument(() => {
      const w = window as typeof window & {
        __testContextScriptVar?: string;
      };
      w.__testContextScriptVar = "Hello from context.initScript!";
    });

    const pageA = await context.newPage();
    await pageA.goto("https://example.com");

    const resultA = await pageA.evaluate(() => {
      const w = window as typeof window & {
        __testContextScriptVar?: string;
      };
      return w.__testContextScriptVar;
    });
    expect(resultA).toBe("Hello from context.initScript!");

    const pageB = await context.newPage();
    await pageB.goto("https://docs.browserbase.com");

    const resultB = await pageB.evaluate(() => {
      const w = window as typeof window & {
        __testContextScriptVar?: string;
      };
      return w.__testContextScriptVar;
    });
    expect(resultB).toBe("Hello from context.initScript!");

    await stagehand.close();
  });
});
