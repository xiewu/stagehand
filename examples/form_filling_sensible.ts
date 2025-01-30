import { Stagehand } from "@/dist";
import StagehandConfig from "@/stagehand.config";

async function formFillingSensible() {
  const stagehand = new Stagehand({
    ...StagehandConfig,
    // Uncomment the following lines to run locally or use a different model
    // env: "LOCAL",
    // modelName: "gpt-4o-mini",
  });
  await stagehand.init();

  // Block manifest worker to prevent PWA installation popup
  await stagehand.page.route("**/manifest.json", (route) => route.abort());

  // Go to the website and wait for it to load
  await stagehand.page.goto("https://file.1040.com/estimate/", {
    waitUntil: "networkidle",
    timeout: 30000,
  });

  // Observe the form fields with suggested actions
  const observed = await stagehand.page.observe({
    instruction:
      "fill all the form fields in the page with mock data. In the description inlcude the field name",
    returnAction: true,
  });

  // Uncomment the following line to see the stagehand candidate suggestions (initial)
  // console.log(observed);

  // Create a mapping of 1+ keywords in the form fields to standardize field names
  const mapping = (description: string): string | null => {
    const keywords: { [key: string]: string[] } = {
      age: ["old"],
      dependentsUnder17: ["under age 17", "child", "minor"],
      dependents17to23: ["17-23", "school", "student"],
      wages: ["wages", "W-2 Box 1"],
      federalTax: ["federal tax", "Box 2"],
      stateTax: ["state tax", "Box 17"],
    };

    for (const [key, terms] of Object.entries(keywords)) {
      if (terms.some((term) => description.toLowerCase().includes(term))) {
        return key;
      }
    }
    return null;
  };

  // Fill the form fields with sensible data. This data will only be used in your session and not be shared with LLM providers/external APIs.
  const userInputs: { [key: string]: string } = {
    age: "26",
    dependentsUnder17: "1",
    wages: "54321",
    federalTax: "8345",
    stateTax: "2222",
  };

  const updatedFields = observed.map((candidate) => {
    const key = mapping(candidate.description);
    if (key && userInputs[key]) {
      candidate.arguments = [userInputs[key]];
    }
    return candidate;
  });
  // List of sensible-data candidates
  console.log(updatedFields);

  // Fill all the form fields with the sensible candidates
  for (const candidate of updatedFields) {
    await stagehand.page.act(candidate);
  }
}

(async () => {
  await formFillingSensible();
})();
