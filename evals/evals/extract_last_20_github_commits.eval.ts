import { EvalLogger } from "../utils";
import { Stagehand } from "../../lib";
import { LogLine } from "../../lib/types";
import { z } from "zod";
import { Eval, TestConfig } from "../utils";

export const extract_last_twenty_github_commits: Eval = async ({
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
      action:
        "find commit history, generally described by the number of commits",
    });
    const { commits } = await stagehand.extract({
      instruction: "Extract last 20 commits",
      schema: z.object({
        commits: z.array(
          z.object({
            commit_message: z.string(),
            commit_url: z.string(),
            commit_hash: z.string(),
          }),
        ),
      }),
      modelName,
    });

    logger.log({
      message: "Extracted commits",
      level: 1,
      auxiliary: {
        commits: {
          value: JSON.stringify(commits),
          type: "object",
        },
      },
    });
    await stagehand.context.close().catch(() => {});
    return {
      _success: commits.length === 20,
      commits,
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
