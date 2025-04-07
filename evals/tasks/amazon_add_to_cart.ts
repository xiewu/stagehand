import { EvalFunction } from "@/types/evals";

export const amazon_add_to_cart: EvalFunction = async ({
  logger,
  debugUrl,
  sessionUrl,
  stagehand,
}) => {
  await stagehand.page.goto("https://www.amazon.com");

  await stagehand.page.act("click on the search bar");
  await stagehand.page.act("type 'amazon basics classic lined notebook'");
  await stagehand.page.act("click on the search button");
  await stagehand.page.act("click on the first relevant search result");
  await stagehand.page.act("click the 'Add to Cart' button");
  await stagehand.page.act({
    action: "click the 'Proceed to checkout' button",
  });
  const currentUrl = stagehand.page.url();
  const expectedUrlPrefix = "https://www.amazon.com/ap/signin";

  return {
    _success: currentUrl.startsWith(expectedUrlPrefix),
    currentUrl,
    debugUrl,
    sessionUrl,
    logs: logger.getLogs(),
  };
};
