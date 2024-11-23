import { Eval, EvalLogger, TestConfig } from "../utils";
import { Stagehand } from "../../lib";
import type { AvailableModel } from "../../lib/llm/LLMProvider";
import { LogLine } from "../../lib/types";

export const laroche_form: Eval = async ({
  modelName,
  enableCaching,
  env,
}: TestConfig) => {
  const logger = new EvalLogger();

  const stagehand = new Stagehand({
    env,
    verbose: 2,
    debugDom: true,
    headless: process.env.HEADLESS !== "false",
    logger: (logLine: LogLine) => {
      logger.log(logLine);
    },
    enableCaching,
  });

  logger.init(stagehand);

  const { debugUrl, sessionUrl } = await stagehand.init({ modelName });

  try {
    await stagehand.page.goto(
      "https://www.laroche-posay.us/offers/anthelios-melt-in-milk-sunscreen-sample.html",
    );

    await stagehand.act({ action: "close the privacy policy popup" });

    // Wait for possible navigation
    await stagehand.page
      .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 10000 })
      .catch(() => {});

    await stagehand.act({ action: "fill the last name field" });
    await stagehand.act({ action: "fill address 1 field" });
    await stagehand.act({ action: "select a state" });
    await stagehand.act({ action: "select a skin type" });

    // TODO - finish this eval once we have a way to extract form data from children iframes

    // const formData = await stagehand.extract({
    //   instruction: "Extract the filled form data",
    //   schema: z.object({
    //     firstName: z.string(),
    //     lastName: z.string(),
    //     email: z.string(),
    //     phone: z.string(),
    //     zipCode: z.string(),
    //     interestedIn: z.string(),
    //     startTerm: z.string(),
    //     programOfInterest: z.string(),
    //   }),
    //   modelName: "gpt-4o",
    // });

    // console.log("Extracted form data:", formData);

    // const isFormDataValid =
    //   formData.firstName === "John" &&
    //   formData.lastName === "Doe" &&
    //   formData.email === "john.doe@example.com" &&
    //   formData.phone === "1234567890" &&
    //   formData.zipCode === "12345" &&
    return {
      _success: true,
      logs: logger.getLogs(),
      debugUrl,
      sessionUrl,
    };
  } catch (error) {
    logger.error({
      message: "error in LarocheForm function",
      level: 0,
      auxiliary: {
        error: {
          value: error.message,
          type: "string",
        },
        trace: {
          value: error.stack,
          type: "string",
        },
      },
    });
    return {
      _success: false,
      error: error.message,
      debugUrl,
      sessionUrl,
      logs: logger.getLogs(),
    };
  } finally {
    await stagehand.context.close().catch(() => {});
  }
};
