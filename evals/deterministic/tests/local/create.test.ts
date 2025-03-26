import { test, expect } from "@playwright/test";
import { Stagehand } from "@/dist";
import path from "path";
import fs from "fs";
import os from "os";
import type { Cookie } from "@playwright/test";
import StagehandConfig from "../../e2e.stagehand.config";
import Browserbase from "@browserbasehq/sdk";

test.describe("Local browser launch options", () => {
  test("launches with default options when no localBrowserLaunchOptions provided", async () => {
    const stagehand = new Stagehand(StagehandConfig);
    await stagehand.init();

    const context = stagehand.context;
    expect(context.browser()).toBeDefined();
    expect(context.pages().length).toBe(1);

    await stagehand.close();
  });

  test("respects custom userDataDir", async () => {
    const customUserDataDir = path.join(os.tmpdir(), "custom-user-data");

    const stagehand = new Stagehand({
      ...StagehandConfig,
      localBrowserLaunchOptions: {
        headless: true,
        userDataDir: customUserDataDir,
      },
    });
    await stagehand.init();

    expect(fs.existsSync(customUserDataDir)).toBeTruthy();

    await stagehand.close();

    // Cleanup
    fs.rmSync(customUserDataDir, { recursive: true, force: true });
  });

  test("applies custom viewport settings", async () => {
    const customViewport = { width: 1920, height: 1080 };

    const stagehand = new Stagehand({
      ...StagehandConfig,
      localBrowserLaunchOptions: {
        viewport: customViewport,
      },
    });
    await stagehand.init();

    const page = await stagehand.context.newPage();
    const viewport = page.viewportSize();

    expect(viewport).toEqual(customViewport);

    await stagehand.close();
  });

  test("applies custom cookies", async () => {
    const testCookies: Cookie[] = [
      {
        name: "testCookie",
        value: "testValue",
        domain: "example.com",
        path: "/",
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: "Lax" as const,
      },
    ];

    const stagehand = new Stagehand({
      ...StagehandConfig,
      localBrowserLaunchOptions: {
        cookies: testCookies,
      },
    });
    await stagehand.init();

    const page = await stagehand.context.newPage();
    await page.goto("https://example.com");
    const cookies = await stagehand.context.cookies();

    expect(cookies[0]).toMatchObject(
      testCookies[0] as unknown as Record<string, unknown>,
    );

    await stagehand.close();
  });

  test("applies custom geolocation settings", async () => {
    const customGeolocation = {
      latitude: 40.7128,
      longitude: -74.006,
    };

    const stagehand = new Stagehand({
      ...StagehandConfig,
      localBrowserLaunchOptions: {
        geolocation: customGeolocation,
        permissions: ["geolocation"],
      },
    });
    await stagehand.init();

    const page = await stagehand.context.newPage();
    await page.goto("https://example.com");

    const location = await page.evaluate(() => {
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
          },
          () => resolve(null),
        );
      });
    });

    expect(location).toEqual(customGeolocation);

    await stagehand.close();
  });

  test("applies custom timezone and locale", async () => {
    const stagehand = new Stagehand({
      ...StagehandConfig,
      localBrowserLaunchOptions: {
        locale: "ja-JP",
        timezoneId: "Asia/Tokyo",
      },
    });
    await stagehand.init();

    const page = await stagehand.context.newPage();
    await page.goto("https://example.com");

    const { locale, timezone } = await page.evaluate(() => ({
      locale: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }));

    expect(locale).toBe("ja-JP");
    expect(timezone).toBe("Asia/Tokyo");

    await stagehand.close();
  });

  test("records video when enabled", async () => {
    const videoDir = path.join(os.tmpdir(), "test-videos");
    fs.mkdirSync(videoDir, { recursive: true });

    const stagehand = new Stagehand({
      ...StagehandConfig,
      localBrowserLaunchOptions: {
        recordVideo: {
          dir: videoDir,
          size: { width: 800, height: 600 },
        },
      },
    });
    await stagehand.init();

    const page = await stagehand.context.newPage();
    await page.goto("https://example.com");
    await stagehand.close();

    const videos = fs.readdirSync(videoDir);
    expect(videos.length).toBeGreaterThan(0);
    expect(videos[0]).toMatch(/\.webm$/);

    // Cleanup
    fs.rmSync(videoDir, { recursive: true, force: true });
  });

  test("respects custom CDP URL", async () => {
    const bb = new Browserbase({
      apiKey: process.env.BROWSERBASE_API_KEY,
    });
    const customCdpUrl = await bb.sessions.create({
      projectId: process.env.BROWSERBASE_PROJECT_ID,
    });

    const stagehand = new Stagehand({
      ...StagehandConfig,
      localBrowserLaunchOptions: {
        cdpUrl: customCdpUrl.connectUrl,
      },
    });
    await stagehand.init();

    /**
     * Test context.pages() functionality
     */
    test("should return array of enhanced pages via context.pages()", async () => {
      const context = stagehand.context;

      // Create multiple pages
      const page1 = await context.newPage();
      const page2 = await context.newPage();

      await page1.goto(`https://www.google.com`);
      await page2.goto(`https://www.bing.com`);

      const pages = context.pages();
      expect(pages).toContain(page1);
      expect(pages).toContain(page2);

      // Verify all pages have enhanced capabilities
      for (const page of pages) {
        expect(typeof page.act).toBe("function");
        expect(typeof page.extract).toBe("function");
        expect(typeof page.observe).toBe("function");
      }

      await stagehand.close();
    });
  });
});
