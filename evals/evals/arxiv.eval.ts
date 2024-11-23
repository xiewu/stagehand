import { EvalLogger } from "../utils";
import { Stagehand } from "../../lib";
import { LogLine } from "../../lib/types";
import { Eval, TestConfig } from "../utils";
import { z } from "zod";
export const arxiv: Eval = async ({
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

  interface Paper {
    title: string;
    link: string | null;
    category: string | null;
    problem: string | null;
    methodology: string | null;
    results: string | null;
    conclusion: string | null;
    code: string | null;
  }

  const papers: Paper[] = [];

  try {
    await stagehand.page.goto("https://arxiv.org/search/");

    await stagehand.act({
      action:
        "search for the recent papers about web agents with multimodal models",
    });

    const paper_links = await stagehand.extract({
      instruction: "extract the titles and links for two papers",
      schema: z.object({
        papers: z
          .array(
            z.object({
              title: z.string().describe("the title of the paper"),
              link: z.string().describe("the link to the paper").nullable(),
            }),
          )
          .describe("list of papers"),
      }),
      modelName: "gpt-4o-2024-08-06",
    });

    if (
      !paper_links ||
      !paper_links.papers ||
      paper_links.papers.length === 0
    ) {
      return {
        _success: false,
        logs: logger.getLogs(),
        debugUrl,
        sessionUrl,
      };
    }

    for (const paper of paper_links.papers) {
      if (paper.link) {
        await stagehand.page.goto(paper.link);
        const abstract = await stagehand.extract({
          instruction: "extract details of the paper from the abstract",
          schema: z.object({
            category: z
              .string()
              .describe(
                "the category of the paper. one of {'Benchmark', 'Dataset', 'Model', 'Framework', 'System', 'Other'}",
              ),
            problem: z
              .string()
              .describe(
                "summarize the problem that the paper is trying to solve in one sentence",
              )
              .nullable(),
            methodology: z
              .string()
              .describe(
                "summarize the methodology of the paper in one sentence",
              )
              .nullable(),
            results: z
              .string()
              .describe("summarize the results of the paper in one sentence")
              .nullable(),
            conclusion: z
              .string()
              .describe("summarize the conclusion of the paper in one sentence")
              .nullable(),
            code: z
              .string()
              .describe(
                "if provided, extract only the link to the code repository, without additional text. this is often optional and not always provided.",
              )
              .nullable(),
          }),
          modelName: "gpt-4o-2024-08-06",
        });

        papers.push({
          title: paper.title,
          link: paper.link,
          category: abstract.category,
          problem: abstract.problem,
          methodology: abstract.methodology,
          results: abstract.results,
          conclusion: abstract.conclusion,
          code: abstract.code,
        });
      }
    }

    if (!papers || papers.length === 0) {
      return {
        _success: false,
        logs: logger.getLogs(),
        debugUrl,
        sessionUrl,
      };
    }

    logger.log({
      message: "papers",
      level: 1,
      auxiliary: {
        papers: {
          value: JSON.stringify(papers),
          type: "object",
        },
      },
    });

    // Assert that the length of papers is three
    if (papers.length !== 2) {
      logger.error({
        message: "incorrect number of papers extracted",
        level: 0,
        auxiliary: {
          expected: {
            value: "2",
            type: "integer",
          },
          actual: {
            value: papers.length.toString(),
            type: "integer",
          },
        },
      });
      return {
        _success: false,
        error: "Incorrect number of papers extracted",
        logs: logger.getLogs(),
        debugUrl,
        sessionUrl,
      };
    }

    // Ensure that every paper has a problem and methodology
    for (const paper of papers) {
      if (!paper.problem || !paper.methodology) {
        logger.error({
          message: `paper missing problem or methodology`,
          level: 0,
          auxiliary: {
            paper: {
              value: JSON.stringify(paper),
              type: "object",
            },
          },
        });
        return {
          _success: false,
          error: "Incomplete paper information",
          logs: logger.getLogs(),
          debugUrl,
          sessionUrl,
        };
      }
    }

    return {
      _success: true,
      papers,
      logs: logger.getLogs(),
      debugUrl,
      sessionUrl,
    };
  } catch (error) {
    logger.error({
      message: `error in arxiv function`,
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
      logs: logger.getLogs(),
      debugUrl,
      sessionUrl,
    };
  } finally {
    await stagehand.context.close().catch(() => {});
  }
};
