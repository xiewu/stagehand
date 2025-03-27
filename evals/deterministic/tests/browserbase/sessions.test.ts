import { test, expect } from "@playwright/test";
import { Stagehand } from "@/dist";
import StagehandConfig from "@/evals/deterministic/stagehand.config";
import Browserbase from "@browserbasehq/sdk";

test.describe("Browserbase Sessions", () => {
  let stagehand: Stagehand;
  let browserbase: Browserbase;
  let sessionId: string;

  test.beforeAll(async () => {
    browserbase = new Browserbase({
      apiKey: process.env.BROWSERBASE_API_KEY,
    });
    const session = await browserbase.sessions.create({
      projectId: process.env.BROWSERBASE_PROJECT_ID,
    });
    sessionId = session.id;
  });
  test("resumes a session via sessionId", async () => {
    stagehand = new Stagehand({
      ...StagehandConfig,
      browserbaseSessionID: sessionId,
    });
    await stagehand.init();

    const page = stagehand.page;
    await page.goto("https://docs.stagehand.dev/get_started/introduction");

    expect(page.url()).toBe(
      "https://docs.stagehand.dev/get_started/introduction",
    );
    await stagehand.close();
  });
  test("resumes a session via CDP URL", async () => {
    const session = await browserbase.sessions.retrieve(sessionId);
    stagehand = new Stagehand({
      ...StagehandConfig,
      localBrowserLaunchOptions: {
        cdpUrl: session.cdpUrl,
      },
    });
    await stagehand.init();
  });
});
