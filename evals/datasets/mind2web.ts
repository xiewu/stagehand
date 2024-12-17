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

export async function loadMind2WebDataset(
  split: "train" | "test" = "train",
): Promise<Mind2WebTask[]> {
  try {
    const response = await fetch(
      `https://huggingface.co/datasets/iMeanAI/Mind2Web-Live/raw/main/mind2web-live_${split}_20240528.json`,
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch ${split} split from Mind2Web-Live dataset: ${response.statusText}`,
      );
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error loading Mind2Web dataset:", error);
    throw error;
  }
}
