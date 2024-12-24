import { readFileSync, existsSync } from "fs";
import { join } from "path";

export interface Mind2WebTask {
  index: string;
  task: string;
  reference_task_length: number;
  evaluation: Array<{
    content: {
      key: string;
      netloc: string | null;
      path: string | null;
      reference_answer: string;
      url: string;
    };
    match_function_name: string;
    method: string | null;
  }>;
  time: string;
}

export async function loadMind2WebDataset(): Promise<Mind2WebTask[]> {
  try {
    const testDataPath = join(__dirname, "mind2web_test.json");

    if (!existsSync(testDataPath)) {
      throw new Error(`Test dataset not found at ${testDataPath}`);
    }

    const data = JSON.parse(readFileSync(testDataPath, "utf8"));
    return data;
  } catch (error) {
    console.error("Error loading Mind2Web dataset:", error);
    throw error;
  }
}
