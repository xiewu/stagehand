import { EvalLogger, TestConfig } from "../utils";
import { Stagehand } from "../../lib";
import { z } from "zod";
import { LogLine } from "../../lib/types";

export const google_jobs = async ({
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
    await stagehand.page.goto("https://www.google.com/");

    await stagehand.act({ action: "click on the about page" });

    await stagehand.act({ action: "click on the careers page" });

    await stagehand.act({ action: "input data scientist into role" });

    await stagehand.act({ action: "input new york city into location" });

    await stagehand.act({ action: "click on the search button" });

    // NOTE: "click on the first Learn More button" is not working - the span for learn more is not clickable and the a href is after it
    await stagehand.act({ action: "click on the first job link" });

    const jobDetails = await stagehand.extract({
      instruction:
        "Extract the following details from the job posting: application deadline, minimum qualifications (degree and years of experience), and preferred qualifications (degree and years of experience)",
      schema: z.object({
        applicationDeadline: z
          .string()
          .describe("The date until which the application window will be open")
          .nullable(),
        minimumQualifications: z.object({
          degree: z.string().describe("The minimum required degree").nullable(),
          yearsOfExperience: z
            .number()
            .describe("The minimum required years of experience")
            .nullable(),
        }),
        preferredQualifications: z.object({
          degree: z.string().describe("The preferred degree").nullable(),
          yearsOfExperience: z
            .number()
            .describe("The preferred years of experience")
            .nullable(),
        }),
      }),
      modelName: "gpt-4o-2024-08-06",
    });

    logger.log({
      message: "got job details",
      level: 1,
      auxiliary: {
        jobDetails: {
          value: JSON.stringify(jobDetails),
          type: "object",
        },
      },
    });

    const isJobDetailsValid =
      jobDetails &&
      Object.values(jobDetails).every(
        (value) =>
          value !== null &&
          value !== undefined &&
          (typeof value !== "object" ||
            Object.values(value).every(
              (v) =>
                v !== null &&
                v !== undefined &&
                (typeof v === "number" || typeof v === "string"),
            )),
      );

    logger.log({
      message: "job details valid",
      level: 1,
      auxiliary: {
        isJobDetailsValid: {
          value: isJobDetailsValid.toString(),
          type: "boolean",
        },
      },
    });

    return {
      _success: isJobDetailsValid,
      jobDetails,
      debugUrl,
      sessionUrl,
      logs: logger.getLogs(),
    };
  } catch (error) {
    logger.error({
      message: "error in google_jobs function",
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
      debugUrl,
      sessionUrl,
      error: JSON.parse(JSON.stringify(error, null, 2)),
      logs: logger.getLogs(),
    };
  } finally {
    await stagehand.context.close();
  }
};
