import { Eval as runEval } from "braintrust";
import type { AvailableModel } from "../lib/llm/LLMProvider";
import type { Eval } from "./utils";
import process from "process";
import { vanta } from "./evals/vanta.eval";
import { vanta_h } from "./evals/vanta_h.eval";
import { peeler_simple } from "./evals/peeler_simple.eval";
import { peeler_complex } from "./evals/peeler_complex.eval";
import { wikipedia } from "./evals/wikipedia.eval";
import { simple_google_search } from "./evals/simple_google_search.eval";
import { extract_github_stars } from "./evals/extract_github_stars.eval";
import { extract_collaborators_from_github_repository } from "./evals/extract_collaborators_from_github_repository.eval";
import { extract_last_twenty_github_commits } from "./evals/extract_last_20_github_commits.eval";
import { costar } from "./evals/costar.eval";
import { google_jobs } from "./evals/google_jobs.eval";
import { homedepot } from "./evals/homedepot.eval";
import { extract_partners } from "./evals/extract_partners.eval";
import { laroche_form } from "./evals/laroche_form.eval";
import { arxiv } from "./evals/arxiv.eval";
import { expedia } from "./evals/expedia.eval";

// const env =
//   process.env.EVAL_ENV?.toLowerCase() === "browserbase"
//     ? "BROWSERBASE"
//     : "LOCAL";
const env = "BROWSERBASE";

const enableCaching = process.env.EVAL_ENABLE_CACHING?.toLowerCase() === "true";

const models: AvailableModel[] = ["gpt-4o", "claude-3-5-sonnet-20241022"];

const tasks: Record<string, Eval> = {
  vanta,
  vanta_h,
  peeler_simple,
  peeler_complex,
  wikipedia,
  simple_google_search,
  extract_github_stars,
  extract_collaborators_from_github_repository,
  extract_last_twenty_github_commits,
  costar,
  google_jobs,
  homedepot,
  extract_partners,
  laroche_form,
  arxiv,
  expedia,
};

const exactMatch = (args: {
  input: any;
  output: any;
  expected?: any;
}): {
  name: string;
  score: number;
} => {
  console.log(`Task "${args.input.name}" returned: ${args.output}`);

  const expected = args.expected ?? true;
  if (expected === true) {
    return {
      name: "Exact match",
      score: args.output === true || args.output?._success == true ? 1 : 0,
    };
  }

  return {
    name: "Exact match",
    score: args.output === expected ? 1 : 0,
  };
};

const errorMatch = (args: {
  input: any;
  output: any;
}): { name: string; score: number } => {
  return {
    name: "Error match",
    score:
      args.output?._success === false || args.output?.error !== undefined
        ? 1
        : 0,
  };
};

const testcases = [
  "vanta",
  "vanta_h",
  "peeler_simple",
  "wikipedia",
  "peeler_complex",
  "simple_google_search",
  "extract_github_stars",
  "extract_collaborators_from_github_repository",
  "extract_last_twenty_github_commits",
  "google_jobs",
  "homedepot",
  "extract_partners",
  "laroche_form",
  "arxiv",
  //   "expedia"
];

runEval("stagehand", {
  data: () => {
    // create a testcase for each model
    return models.flatMap((model) =>
      testcases.map((test) => ({
        input: { name: test, modelName: model },
        name: `${test}-${model}`,
        tags: [model],
      })),
    );
  },
  task: async (input: { name: string; modelName: AvailableModel }) => {
    try {
      // Handle predefined tasks
      const result = await (tasks as any)[input.name]({
        modelName: input.modelName,
        enableCaching,
        env,
      });
      if (result) {
        console.log(`✅ ${input.name}: Passed`);
      } else {
        console.log(`❌ ${input.name}: Failed`);
      }
      return result;
    } catch (error) {
      console.error(`❌ ${input.name}: Error - ${error}`);
      return {
        _success: false,
        error: JSON.parse(JSON.stringify(error, null, 2)),
      };
    }
  },
  scores: [exactMatch, errorMatch],
  //   maxConcurrency: 5,
  trialCount: 5,
});
