/**
 * This script orchestrates the running of evaluations against a set of tasks.
 * It leverages the "braintrust" evaluation framework to run multiple testcases
 * (each testcase representing a given task-model combination) and then aggregates
 * the results, producing a summary of passes, failures, and categorized success rates.
 *
 * Overview:
 * - Reads a configuration file `evals.config.json` to determine what tasks (evaluations)
 *   are available and which categories they belong to.
 * - Supports filtering which tasks to run either by evaluation category or by specific task name.
 * - Supports multiple models, defaulting to certain sets of models depending on the category.
 * - Runs each selected task against each selected model in parallel, collecting results.
 * - Saves a summary of the evaluation results to `eval-summary.json`.
 */

import fs from "fs";
import path from "path";
import process from "process";
import { Eval } from "braintrust";
import {
  EvalCategorySchema,
  EvalFunction,
  SummaryResult,
  Testcase,
} from "../types/evals";
import { AvailableModel, AvailableModelSchema } from "../types/model";
import { EvalLogger, env, generateExperimentName } from "./utils";
import { exactMatch, errorMatch } from "./scoring";

const MAX_CONCURRENCY = 20;
const TRIAL_COUNT = 5;

// Extract command-line arguments passed to this script.
const args = process.argv.slice(2);

// The configuration file `evals.config.json` contains a list of tasks and their associated categories.
const configPath = path.join(__dirname, "evals.config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

/**
 * The default categories of evaluations to run if none is specified.
 * These categories represent different styles or types of tasks.
 */
const DEFAULT_EVAL_CATEGORIES = process.env.EVAL_CATEGORIES
  ? process.env.EVAL_CATEGORIES.split(",")
  : [
      "observe",
      "act",
      "combination",
      "extract",
      "experimental",
      "text_extract",
    ];

/**
 * Determine which extraction method to use for tasks that involve extraction.
 * By default, "domExtract" is used. However, if a `--extract-method=<method>`
 * argument is provided, it will override the default.
 */
let extractMethod = "domExtract";
const extractMethodArg = args.find((arg) =>
  arg.startsWith("--extract-method="),
);
if (extractMethodArg) {
  extractMethod = extractMethodArg.split("=")[1];
}

// Set the extraction method in the process environment so tasks can reference it.
process.env.EXTRACT_METHOD = extractMethod;
const useTextExtract = process.env.EXTRACT_METHOD === "textExtract";

/**
 * Variables for filtering which tasks to run:
 * - `filterByCategory`: if provided, only tasks that belong to this category will be run.
 * - `filterByEvalName`: if provided, only the task with this name will be run.
 */
let filterByCategory: string | null = null;
let filterByEvalName: string | null = null;

/**
 * Check the first argument:
 * - If it is "category", the next argument should be the category name.
 * - Otherwise, assume it is a specific evaluation (task) name.
 */
if (args.length > 0) {
  if (args[0].toLowerCase() === "category") {
    filterByCategory = args[1];
    if (!filterByCategory) {
      console.error("Error: Category name not specified.");
      process.exit(1);
    }
    // Validate that the category is one of the known ones.
    try {
      EvalCategorySchema.parse(filterByCategory);
    } catch {
      console.error(
        `Error: Invalid category "${filterByCategory}". Valid categories are: ${DEFAULT_EVAL_CATEGORIES.join(", ")}`,
      );
      process.exit(1);
    }
  } else {
    // Otherwise, treat it as a filter by evaluation name.
    filterByEvalName = args[0];
  }
}

/**
 * The `tasksConfig` defines all tasks from the config file. Each task has a name and categories.
 * We create a mapping `tasksByName` from task name to its categories for quick lookup.
 */
type TaskConfig = { name: string; categories: string[] };
const tasksConfig = config.tasks as TaskConfig[];

const tasksByName = tasksConfig.reduce<
  Record<string, { categories: string[] }>
>((acc, task) => {
  acc[task.name] = { categories: task.categories };
  return acc;
}, {});

/**
 * If filtering by a specific eval name (task), ensure that this task actually exists.
 */
if (filterByEvalName && !tasksByName[filterByEvalName]) {
  console.error(`Error: Evaluation "${filterByEvalName}" does not exist.`);
  process.exit(1);
}

/**
 * Determine which models to run the evaluations against.
 *
 * DEFAULT_EVAL_MODELS: The default set of models used for most categories.
 * EXPERIMENTAL_EVAL_MODELS: Additional models included if the category is "experimental".
 */
const DEFAULT_EVAL_MODELS = process.env.EVAL_MODELS
  ? process.env.EVAL_MODELS.split(",")
  : ["gpt-4o", "claude-3-5-sonnet-latest"];

const EXPERIMENTAL_EVAL_MODELS = process.env.EXPERIMENTAL_EVAL_MODELS
  ? process.env.EXPERIMENTAL_EVAL_MODELS.split(",")
  : ["o1-mini", "o1-preview"];

/**
 * getModelList:
 * Returns a list of models to be used for the given category.
 * If category is "experimental", it merges DEFAULT_EVAL_MODELS and EXPERIMENTAL_EVAL_MODELS.
 * Otherwise, returns DEFAULT_EVAL_MODELS.
 */
const getModelList = (category: string | null): string[] => {
  if (category === "experimental") {
    // Remove duplicates by creating a Set and converting back to array.
    return Array.from(
      new Set([...DEFAULT_EVAL_MODELS, ...EXPERIMENTAL_EVAL_MODELS]),
    );
  }
  return DEFAULT_EVAL_MODELS;
};

/**
 * MODELS: Final list of models that will be tested. We validate each model against `AvailableModelSchema`
 * to ensure they are supported.
 */
const MODELS: AvailableModel[] = getModelList(filterByCategory).map((model) => {
  if (!AvailableModelSchema.safeParse(model).success) {
    throw new Error(`Model ${model} is not a supported model`);
  }
  return model as AvailableModel;
});

/**
 * generateSummary:
 * After all evaluations have finished, aggregate the results into a summary.
 * This summary includes:
 * - Which tasks passed or failed (with model and categories).
 * - Category-wise success percentages.
 * - Model-wise success percentages.
 *
 * The summary is written to `eval-summary.json` for further analysis.
 */
const generateSummary = async (
  results: SummaryResult[],
  experimentName: string,
) => {
  // Determine passed testcases (those with _success: true)
  const passed = results
    .filter((r) => r.output._success)
    .map((r) => ({
      eval: r.input.name,
      model: r.input.modelName,
      categories: tasksByName[r.input.name].categories,
    }));

  // Determine failed testcases (those with _success: false)
  const failed = results
    .filter((r) => !r.output._success)
    .map((r) => ({
      eval: r.input.name,
      model: r.input.modelName,
      categories: tasksByName[r.input.name].categories,
    }));

  // Calculate success counts for each category
  const categorySuccessCounts: Record<
    string,
    { total: number; success: number }
  > = {};
  for (const taskName of Object.keys(tasksByName)) {
    const taskCategories = tasksByName[taskName].categories;
    const taskResults = results.filter((r) => r.input.name === taskName);
    const successCount = taskResults.filter((r) => r.output._success).length;

    for (const cat of taskCategories) {
      if (!categorySuccessCounts[cat]) {
        categorySuccessCounts[cat] = { total: 0, success: 0 };
      }
      categorySuccessCounts[cat].total += taskResults.length;
      categorySuccessCounts[cat].success += successCount;
    }
  }

  // Compute percentage success per category
  const categories: Record<string, number> = {};
  for (const [cat, counts] of Object.entries(categorySuccessCounts)) {
    categories[cat] = Math.round((counts.success / counts.total) * 100);
  }

  // Compute percentage success per model
  const models: Record<string, number> = {};
  const allModels = [...new Set(results.map((r) => r.input.modelName))];
  for (const model of allModels) {
    const modelResults = results.filter((r) => r.input.modelName === model);
    const successCount = modelResults.filter((r) => r.output._success).length;
    models[model] = Math.round((successCount / modelResults.length) * 100);
  }

  // Format and write the summary to a JSON file
  const formattedSummary = {
    experimentName,
    passed,
    failed,
    categories,
    models,
  };

  fs.writeFileSync(
    "eval-summary.json",
    JSON.stringify(formattedSummary, null, 2),
  );
  console.log("Evaluation summary written to eval-summary.json");
};

/**
 * generateFilteredTestcases:
 * Based on the chosen filters (category or specific eval name) and environment,
 * this function generates the set of testcases to run. Each testcase is a combination
 * of a task and a model.
 *
 * Steps:
 * - Start with all combinations of tasks (from `tasksByName`) and models (`MODELS`).
 * - Filter by category if a category filter was specified.
 * - Filter by evaluation name if specified.
 * - In the BROWSERBASE environment, exclude certain tasks that are not suitable.
 */
const generateFilteredTestcases = (): Testcase[] => {
  // Create a list of all testcases for each model-task combination.
  let allTestcases = MODELS.flatMap((model) =>
    Object.keys(tasksByName).map((testName) => ({
      input: { name: testName, modelName: model },
      name: testName,
      tags: [model, testName],
      metadata: {
        model,
        test: testName,
      },
      expected: true,
    })),
  );

  // Filter by category if a category is specified
  if (filterByCategory) {
    allTestcases = allTestcases.filter((testcase) =>
      tasksByName[testcase.name].categories.includes(filterByCategory!),
    );
  }

  // Filter by a specific evaluation (task) name if specified
  if (filterByEvalName) {
    allTestcases = allTestcases.filter(
      (testcase) =>
        testcase.name === filterByEvalName ||
        testcase.input.name === filterByEvalName,
    );
  }

  // If running in BROWSERBASE environment, exclude tasks that are not applicable.
  if (env === "BROWSERBASE") {
    allTestcases = allTestcases.filter(
      (testcase) => !["peeler_simple", "stock_x"].includes(testcase.name),
    );
  }

  return allTestcases;
};

/**
 * Main execution block:
 * - Determine experiment name
 * - Determine the project name (braintrustProjectName) based on CI or dev environment
 * - Run the Eval function with the given configuration:
 *    * experimentName: A label for this run
 *    * data: A function that returns the testcases to run
 *    * task: A function that executes each task, given input specifying model and task name
 *    * scores: An array of scoring functions
 *    * maxConcurrency: Limit on parallel tasks
 *    * trialCount: Number of trials (retries) per task
 * - Collect and summarize results using `generateSummary`.
 */
(async () => {
  // Generate a unique name for the experiment
  const experimentName = generateExperimentName({
    evalName: filterByEvalName || undefined,
    category: filterByCategory || undefined,
    environment: env,
  });

  // Determine braintrust project name to use (stagehand in CI, stagehand-dev otherwise)
  const braintrustProjectName =
    process.env.CI === "true" ? "stagehand" : "stagehand-dev";

  try {
    // Run the evaluations with the braintrust Eval function
    const evalResult = await Eval(braintrustProjectName, {
      experimentName,
      data: generateFilteredTestcases,
      // Each test is a function that runs the corresponding task module
      task: async (input: { name: string; modelName: AvailableModel }) => {
        const logger = new EvalLogger();
        try {
          // Dynamically import the task based on its name
          const taskModulePath = path.join(
            __dirname,
            "tasks",
            `${input.name}.ts`,
          );
          const taskModule = (await import(taskModulePath)) as {
            [key: string]: EvalFunction;
          };
          const taskFunction = taskModule[input.name];

          if (typeof taskFunction !== "function") {
            throw new Error(
              `Task function for ${input.name} is not a function`,
            );
          }

          // Execute the task
          const result = await taskFunction({
            modelName: input.modelName,
            logger,
            useTextExtract,
          });

          // Log result to console
          if (result && result._success) {
            console.log(`✅ ${input.name}: Passed`);
          } else {
            console.log(`❌ ${input.name}: Failed`);
          }
          return result;
        } catch (error: any) {
          // Log any errors that occur during task execution
          console.error(`❌ ${input.name}: Error - ${error}`);
          logger.error({
            message: `Error in task ${input.name}`,
            level: 0,
            auxiliary: {
              error: {
                value: error.message,
                type: "object",
              },
              trace: {
                value: error.stack,
                type: "string",
              },
            },
          });
          return {
            _success: false,
            error: JSON.parse(JSON.stringify(error, null, 2)),
            logs: logger.getLogs(),
          };
        }
      },
      // Use the scoring functions defined above
      scores: [exactMatch, errorMatch],
      maxConcurrency: MAX_CONCURRENCY,
      trialCount: TRIAL_COUNT,
    });

    // Map results to the SummaryResult format
    const summaryResults: SummaryResult[] = evalResult.results.map((result) => {
      const output =
        typeof result.output === "boolean"
          ? { _success: result.output }
          : result.output;

      return {
        input: result.input,
        output,
        name: result.input.name,
        score: output._success ? 1 : 0,
      };
    });

    // Generate and write the summary
    await generateSummary(summaryResults, experimentName);
  } catch (error) {
    console.error("Error during evaluation run:", error);
    process.exit(1);
  }
})();
