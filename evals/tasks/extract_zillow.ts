import { z } from "zod";
import { initStagehand } from "../initStagehand";
import { EvalFunction } from "../../types/evals";

export const extract_zillow: EvalFunction = async ({
  modelName,
  logger,
  useTextExtract,
}) => {
  const { stagehand, initResponse } = await initStagehand({
    modelName,
    logger,
    domSettleTimeoutMs: 3000,
  });

  const { debugUrl, sessionUrl } = initResponse;

  await stagehand.page.goto(
    "https://www.zillow.com/homes/San-Francisco,-CA_rb/",
  );
  const real_estate_listings = await stagehand.page.extract({
    instruction:
      "Extract all the real estate listings with their prices and their addresses.",
    schema: z.object({
      listings: z.array(
        z.object({
          price: z.string().describe("The price of the listing"),
          trails: z.string().describe("The address of the listing"),
        }),
      ),
    }),
    modelName,
    useTextExtract,
  });

  await stagehand.close();
  const listings = real_estate_listings.listings;
  const expectedLength = 38;

  if (listings.length < expectedLength) {
    logger.error({
      message: "Incorrect number of listings extracted",
      level: 0,
      auxiliary: {
        expected: {
          value: expectedLength.toString(),
          type: "integer",
        },
        actual: {
          value: listings.length.toString(),
          type: "integer",
        },
      },
    });
    return {
      _success: false,
      error: "Incorrect number of listings extracted",
      logs: logger.getLogs(),
      debugUrl,
      sessionUrl,
    };
  }

  return {
    _success: true,
    logs: logger.getLogs(),
    debugUrl,
    sessionUrl,
  };
};
