import { Stagehand } from "../lib";
import { z } from "zod";
import { EvalLogger } from "./utils";

// eval failing
const homedepot = async () => {
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    debugDom: true,
    headless: false,
    enableCaching: true,
  });

  await stagehand.init();

  try {
    await stagehand.page.goto("https://www.homedepot.com/");

    const type = "gas grill";

    await stagehand.act({
      action: "search for item",
      variables: { item: type },
    });

    await stagehand.act({ action: `click on the first ${type}` });

    await stagehand.act({ action: "click on the Product Details" });

    await stagehand.act({ action: "find the Primary Burner BTU" });

    const productSpecs = await stagehand.extract({
      instruction: "Extract the Primary Burner BTU of the product",
      schema: z.object({
        productSpecs: z
          .array(
            z.object({
              burnerBTU: z.string().describe("Primary Burner BTU"),
            }),
          )
          .describe("Gas grill Primary Burner BTU"),
      }),
      modelName: "gpt-4o-2024-08-06",
    });
    console.log("The gas grill primary burner BTU is:", productSpecs);

    if (
      !productSpecs ||
      !productSpecs.productSpecs ||
      productSpecs.productSpecs.length === 0
    ) {
      return false;
    }

    return true;
  } catch (error) {
    console.error(`Error in homedepot function: ${error.message}`);
    return false;
  } finally {
    await stagehand.context.close();
  }
};

const vanta = async () => {
  const logger = new EvalLogger();

  const stagehand = new Stagehand({
    env: "LOCAL",
    headless: process.env.HEADLESS !== "false",
    logger: (message: any) => {
      logger.log(message);
    },
    verbose: 2,
  });

  logger.init(stagehand);

  const { debugUrl, sessionUrl } = await stagehand.init();

  await stagehand.page.goto("https://www.vanta.com/");

  const observations = await stagehand.observe({
    instruction: "find the text for the request demo button",
  });

  console.log("Observations:", observations);

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

  const observationResult = await stagehand.page
    .locator(observations[0].selector)
    .first()
    .innerHTML();

  const expectedLocator = `body > div.page-wrapper > div.nav_component > div.nav_element.w-nav > div.padding-global > div > div > nav > div.nav_cta-wrapper.is-new > a.nav_cta-button-desktop.is-smaller.w-button`;

  const expectedResult = await stagehand.page
    .locator(expectedLocator)
    .first()
    .innerHTML();

  await stagehand.context.close();

  return {
    _success: observationResult == expectedResult,
    expected: expectedResult,
    actual: observationResult,
    debugUrl,
    sessionUrl,
    logs: logger.getLogs(),
  };
};

const peeler_complex = async () => {
  const logger = new EvalLogger();

  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 2,
    headless: false,
    logger: (message: { category?: string; message: string }) => {
      logger.log(message.message);
    },
    enableCaching: true,
  });

  logger.init(stagehand);

  const { debugUrl, sessionUrl } = await stagehand.init();

  try {
    await stagehand.page.goto(`https://chefstoys.com/`, { timeout: 60000 });

    await stagehand.act({
      action: "search",
      variables: {
        search_query: "peeler",
      },
    });

    await stagehand.act({
      action: 'click on the first "OXO" brand peeler',
    });

    const { price } = await stagehand.extract({
      instruction: "get the price of the peeler",
      schema: z.object({ price: z.number().nullable() }),
      modelName: "gpt-4o-2024-08-06",
    });

    return {
      _success: price === 11.99,
      price,
      debugUrl,
      sessionUrl,
      logs: logger.getLogs(),
    };
  } catch (error) {
    const errorMessage = JSON.parse(JSON.stringify(error, null, 2));
    const errorStack = errorMessage.stack;
    const fullError = `Error in peeler_complex function: ${errorMessage.message} Trace: ${errorStack}`;
    logger.error(fullError);
    return {
      _success: false,
      error: JSON.parse(JSON.stringify(error, null, 2)),
      debugUrl,
      sessionUrl,
      logs: logger.getLogs(),
    };
  } finally {
    await stagehand.context.close();
  }
};

const arxiv = async () => {
  const logger = new EvalLogger();

  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 2,
    debugDom: true,
    headless: false,
    logger: (message: { category?: string; message: string }) => {
      logger.log(message.message);
    },
    enableCaching: true,
  });

  logger.init(stagehand);

  const { debugUrl, sessionUrl } = await stagehand.init({
    modelName: "gpt-4o-2024-08-06",
  });

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

    logger.log(JSON.stringify(papers, null, 2));

    // Assert that the length of papers is three
    if (papers.length !== 2) {
      logger.log(`Expected 2 papers, but got ${papers.length}`);
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
        logger.log(`Paper "${paper.title}" is missing problem or methodology`);
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
    logger.error(
      `Error in arxiv function: ${error.message}. Trace: ${error.stack}`,
    );
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

const github_login = async (email: string, password: string) => {
  const logger = new EvalLogger();

  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 2,
    headless: false,
    logger: (message: { category?: string; message: string }) => {
      logger.log(message.message);
    },
    enableCaching: true,
  });

  logger.init(stagehand);

  const { debugUrl, sessionUrl } = await stagehand.init();

  try {
    await stagehand.page.goto("https://uber.com/login");

    await stagehand.act({
      action: "click on the login button",
    });

    await stagehand.act({
      action: "fill login form (DO NOT SUBMIT)",
      variables: {
        email,
        // password,
      },
    });
  } catch (error) {
    logger.error(
      `Error in github_login function: ${error.message}. Trace: ${error.stack}`,
    );
    return {
      _success: false,
      error: JSON.parse(JSON.stringify(error, null, 2)),
      debugUrl,
      sessionUrl,
      logs: logger.getLogs(),
    };
  } finally {
    // await stagehand.context.close().catch(() => {});
  }
};

const simple_google_search = async () => {
  const logger = new EvalLogger();

  const stagehand = new Stagehand({
    env: "LOCAL",
    headless: false,
    logger: (message: { category?: string; message: string }) => {
      logger.log(message.message);
    },
    verbose: 2,
    enableCaching: true,
  });

  logger.init(stagehand);

  const { debugUrl, sessionUrl } = await stagehand.init();

  await stagehand.page.goto("https://www.google.com");

  await stagehand.act({
    action: 'Search for "OpenAI"',
  });

  const expectedUrl = "https://www.google.com/search?q=OpenAI";
  const currentUrl = await stagehand.page.url();

  // await stagehand.context.close();

  return {
    _success: currentUrl.startsWith(expectedUrl),
    currentUrl,
    debugUrl,
    sessionUrl,
    logs: logger.getLogs(),
  };
};

async function main() {
  // const result = await github_login("paulg@gmail.com", "test");
  const result = await simple_google_search();
  console.log("Result:", result);
}

main().catch(console.error);
