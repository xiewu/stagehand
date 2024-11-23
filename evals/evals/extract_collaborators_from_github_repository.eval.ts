import { EvalLogger } from "../utils";
import { Stagehand } from "../../lib";
import { LogLine } from "../../lib/types";
import { Eval, TestConfig } from "../utils";
import { z } from "zod";

export const extract_collaborators_from_github_repository: Eval = async ({
  modelName,
  enableCaching,
  env,
}: TestConfig) => {
  const logger = new EvalLogger();

  const stagehand = new Stagehand({
    env,
    verbose: 2,
    headless: process.env.HEADLESS !== "false",
    logger: (logLine: LogLine) => {
      logger.log(logLine);
    },
    enableCaching,
  });

  logger.init(stagehand);

  const { debugUrl, sessionUrl } = await stagehand.init();

  try {
    await stagehand.page.goto("https://github.com/facebook/react");
    await stagehand.act({
      action: "find the contributors section",
    });

    const { contributors } = await stagehand.extract({
      instruction: "Extract top 20 contributors of this repository",
      schema: z.object({
        contributors: z.array(
          z.object({
            github_username: z
              .string()
              .describe("the github username of the contributor"),
            information: z.string().describe("number of commits contributed"),
          }),
        ),
      }),
      modelName,
    });

    console.log("Extracted collaborators:", contributors);
    await stagehand.context.close().catch(() => {});
    return {
      _success: contributors.length === 20,
      contributors,
      debugUrl,
      sessionUrl,
      logs: logger.getLogs(),
    };
  } catch (error) {
    console.error("Error or timeout occurred:", error);
    await stagehand.context.close().catch(() => {});
    return {
      _success: false,
      error: JSON.parse(JSON.stringify(error, null, 2)),
      debugUrl,
      sessionUrl,
      logs: logger.getLogs(),
    };
  }
};
