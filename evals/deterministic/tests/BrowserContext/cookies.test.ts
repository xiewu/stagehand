import { test, expect } from "@playwright/test";
import { Stagehand } from "@/dist";
import StagehandConfig from "@/evals/deterministic/stagehand.config";

test.describe("StagehandContext - Cookies", () => {
  let stagehand: Stagehand;

  test.beforeEach(async () => {
    stagehand = new Stagehand(StagehandConfig);
    await stagehand.init();
  });

  test.afterEach(async () => {
    await stagehand.close();
  });

  test("should add cookies and retrieve them", async () => {
    const context = stagehand.context;

    const cookie = {
      name: "myCookie",
      value: "myValue",
      domain: "example.com",
      path: "/",
      expires: Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: false,
      session: false,
      size: 0,
    };

    await context.setCookie(cookie);

    const cookies = await context.cookies();
    expect(cookies.length).toBeGreaterThan(0);

    const myCookie = cookies.find((c) => c.name === "myCookie");
    expect(myCookie).toBeDefined();
    expect(myCookie?.value).toBe("myValue");
  });

  test("should clear all cookies", async () => {
    const context = stagehand.context;

    const cookie = {
      name: "myOtherCookie",
      value: "anotherValue",
      domain: "example.com",
      path: "/",
      expires: Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: false,
      session: false,
      size: 0,
    };

    await context.setCookie(cookie);

    const cookiesBefore = await context.cookies();
    const found = cookiesBefore.some((c) => c.name === "myOtherCookie");
    expect(found).toBe(true);

    await context.deleteCookie(cookie);

    const cookiesAfter = await context.cookies();
    const stillFound = cookiesAfter.some((c) => c.name === "myOtherCookie");
    expect(stillFound).toBe(false);
  });
});
