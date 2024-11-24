import { AvailableModel } from "../lib/llm/LLMProvider";
import { Stagehand } from "../lib";
import { LogLine } from "../lib/types";
import { EvalLogger } from "./utils";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const test = async ({ modelName }: { modelName: AvailableModel }) => {
  const logger = new EvalLogger();

  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 2,
    headless: false,
    logger: (logLine: LogLine) => {
      logger.log(logLine);
    },
    enableCaching: false,
  });

  logger.init(stagehand);

  const { debugUrl, sessionUrl } = await stagehand.init({
    modelName,
  });

  try {
    await stagehand.page.goto("https://www.google.com");

    const searchResults = await stagehand.extract({
      instruction: "Extract the search box text and button text",
      schema: z.object({
        searchBox: z
          .string()
          .describe("The placeholder text in the search box"),
        searchButton: z.string().describe("The text on the search button"),
      }),
      modelName,
    });

    await stagehand.context.close();

    return {
      _success: true,
      searchResults,
      debugUrl,
      sessionUrl,
      logs: logger.getLogs(),
    };
  } catch (error) {
    logger.error({
      message: "Error in test function",
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

    await stagehand.context.close();

    return {
      _success: false,
      error: JSON.parse(JSON.stringify(error, null, 2)),
      debugUrl,
      sessionUrl,
      logs: logger.getLogs(),
    };
  }
};

const arxiv = async ({ modelName }: { modelName: AvailableModel }) => {
  const logger = new EvalLogger();

  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 2,
    debugDom: true,
    headless: false,
    logger: (logLine: LogLine) => {
      logger.log(logLine);
    },
    enableCaching: false,
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

const amazon_add_to_cart = async ({
  modelName,
}: {
  modelName: AvailableModel;
}) => {
  // Initialize Stagehand with credentials from env
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 2,
    headless: false,
  });

  // Initialize the browser with Claude 3.5 Sonnet
  const { debugUrl, sessionUrl } = await stagehand.init({
    modelName,
  });

  // Navigate directly to the product page
  await stagehand.page.goto(
    "https://www.amazon.com/Laptop-MacBook-Surface-Water-Resistant-Accessories/dp/B0D5M4H5CD",
  );

  await stagehand.page.waitForTimeout(5000);

  // Add to cart
  await stagehand.act({
    action: "click the 'Add to Cart' button",
  });

  //   // Wait a moment for the cart to update
  //   await stagehand.page.waitForTimeout(2000);

  //   // Proceed to checkout
  //   await stagehand.act({
  //     action: "click the 'Proceed to checkout' button",
  //   });

  //   // Wait for page load and check URL
  //   await stagehand.page.waitForTimeout(2000);
  //   const currentUrl = stagehand.page.url();
  //   const expectedUrlPrefix = "https://www.amazon.com/ap/signin";

  //   await stagehand.context.close();

  //   return {
  //     _success: currentUrl.startsWith(expectedUrlPrefix),
  //     currentUrl,
  //     debugUrl,
  //     sessionUrl,
  //   };
};

// test({ modelName: "o1-mini" }).then((res) => {
//   console.log(res);
// });

// arxiv({ modelName: "o1-mini" }).then((res) => {
//   console.log(res);
// });

// a({ modelName: "o1-mini" }).then((res) => {
//   console.log(res);
// });

const vanta = async ({ modelName }: { modelName: AvailableModel }) => {
  console.log("[MODEL NAME]", modelName);
  const logger = new EvalLogger();

  const stagehand = new Stagehand({
    env: "LOCAL",
    headless: false,
    logger: (message: any) => {
      logger.log(message);
    },
    verbose: 2,
    enableCaching: false,
  });

  logger.init(stagehand);

  const { debugUrl, sessionUrl } = await stagehand.init({ modelName });

  await stagehand.page.goto("https://www.vanta.com/");

  const observations = await stagehand.observe();

  if (observations.length === 0) {
    await stagehand.context.close();
    return {
      _success: false,
      observations,
      debugUrl,
      sessionUrl,
      logs: logger.getLogs(),
    };
  }

  const expectedLocator = `body > div.page-wrapper > div.nav_component > div.nav_element.w-nav > div.padding-global > div > div > nav > div.nav_cta-wrapper.is-new > a.nav_cta-button-desktop.is-smaller.w-button`;

  const expectedResult = await stagehand.page
    .locator(expectedLocator)
    .first()
    .innerHTML();

  let foundMatch = false;
  for (const observation of observations) {
    try {
      const observationResult = await stagehand.page
        .locator(observation.selector)
        .first()
        .innerHTML();

      if (observationResult === expectedResult) {
        foundMatch = true;
        break;
      }
    } catch (error) {
      console.warn(
        `Failed to check observation with selector ${observation.selector}:`,
        error.message,
      );
      continue;
    }
  }

  await stagehand.context.close();

  return {
    _success: foundMatch,
    expected: expectedResult,
    observations,
    debugUrl,
    sessionUrl,
    logs: logger.getLogs(),
  };
};

// vanta({ modelName: "gpt-4o-2024-08-06" }).then((res) => {
//   console.log(res);
// });

// amazon_add_to_cart({ modelName: "o1-mini" }).then((res) => {
//   console.log(res);
// });

const observeSchema = z.object({
  elements: z
    .array(
      z.object({
        elementId: z.number().describe("the number of the element"),
        description: z
          .string()
          .describe("a description of the element and what it is relevant for"),
      }),
    )
    .describe("an array of elements that match the instruction"),
});

console.log(JSON.stringify(zodToJsonSchema(observeSchema), null, 2));
