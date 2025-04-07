import { EvalFunction } from "@/types/evals";

export const observe_amazon_add_to_cart: EvalFunction = async ({
  debugUrl,
  sessionUrl,
  stagehand,
  logger,
}) => {
  await stagehand.page.goto(
    "https://www.amazon.com/Laptop-MacBook-Surface-Water-Resistant-Accessories/dp/B0D5M4H5CD",
  );

  await stagehand.page.waitForTimeout(5000);

  const observations1 = await stagehand.page.observe({
    instruction: "Find and click the 'Add to Cart' button",
    onlyVisible: false,
    returnAction: true,
  });

  console.log(observations1);

  // Example of using performPlaywrightMethod if you have the xpath
  if (observations1.length > 0) {
    const action1 = observations1[0];
    await stagehand.page.act(action1);
  }

  await stagehand.page.waitForTimeout(2000);

  const observations2 = await stagehand.page.observe({
    instruction: "Find and click the 'Proceed to checkout' button",
  });

  // Example of using performPlaywrightMethod if you have the xpath
  if (observations2.length > 0) {
    const action2 = observations2[0];
    await stagehand.page.act(action2);
  }
  await stagehand.page.waitForTimeout(2000);

  const currentUrl = stagehand.page.url();
  const expectedUrlPrefix = "https://www.amazon.com/ap/signin";

  await stagehand.close();

  return {
    _success: currentUrl.startsWith(expectedUrlPrefix),
    currentUrl,
    debugUrl,
    sessionUrl,
    logs: logger.getLogs(),
  };
};
