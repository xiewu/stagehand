import { Stagehand } from "../lib";
import { z } from "zod";
import * as fs from "fs";

async function runSingleTask(row: any) {
  const taskId = `[${row.index.slice(0, 6)}]`;
  const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes in milliseconds

  console.log(`\n${taskId} Task: ${row.task}`);
  console.dir(row.evaluation, { depth: null });

  try {
    // Create a promise that rejects after timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error("Task timed out after 5 minutes")),
        TIMEOUT_MS,
      );
    });

    // Race between the task execution and the timeout
    const result = await Promise.race([
      (async () => {
        // Create a new Stagehand instance for each task
        const response = await fetch(
          "https://api.browserbase.com/v1/sessions",
          {
            method: "POST",
            headers: {
              "X-BB-API-KEY": "bb_live_nGPnt44_7J9Vvrnwu5xLIp3K4FE",
              "Content-Type": "application/json",
            } as any,
            body: JSON.stringify({
              projectId: "b079fd1a-fe5f-4443-ab39-ca4b2eeedd6d",
              browserSettings: {
                advancedStealth: true,
              },
              proxies: true,
            }),
          },
        );

        const data = await response.json();
        if (!data || !data.id) {
          console.log(`${taskId} ❌ Failed to create browser session`);
          return false;
        }

        const sessionId = data.id.slice(0, 8);
        console.log(`${taskId} Browser session: ${sessionId}`);

        const stagehand = new Stagehand({
          env: "BROWSERBASE",
          browserbaseResumeSessionID: data.id,
          modelName: "claude-3-5-sonnet-latest",
          verbose: 2,
          logger: (message) => {
            // Filter out messages containing "stagehand:anthropic"
            if (message.category != "anthropic") {
              console.log(message);
            }
          },
          domSettleTimeoutMs: 10_000,
        });

        await stagehand.init();

        const baseUrl = row.evaluation[0]?.content?.url;
        if (baseUrl) {
          await stagehand.page.goto(baseUrl, { timeout: 90_000 });
          const taskParts = row.task.split(" in ");
          const taskWithoutSuffix = taskParts.slice(0, -1).join(" in ");
          console.log(`Task: ${taskWithoutSuffix}`);
          const result = await stagehand.act({
            action: taskWithoutSuffix,
          });

          // Check if task was successful
          console.log(`Resulting URL: ${stagehand.page.url()}`);
          console.log(
            `Expected URL: ${row.evaluation[row.evaluation.length - 1]?.content?.url}`,
          );
          const success =
            stagehand.page.url() ===
            row.evaluation[row.evaluation.length - 1]?.content?.url;
          console.log(
            `${taskId} ${success ? "✅" : "❌"} ${success ? "Success" : "Failed"}`,
          );
          return success;
        }
        console.log(`${taskId} ❌ Failed - No base URL`);
        return false;
      })(),
      timeoutPromise,
    ]);

    return result;
  } catch (error) {
    console.log(`${taskId} ❌ Error: ${error.message}`);
    return false;
  }
}

async function runMind2WebTask() {
  // Read and parse the Mind2Web eval file
  const evalData = JSON.parse(
    fs.readFileSync("./examples/mind2web/evals1.json", "utf-8"),
  );

  // Pick a random row
  const randomIndex = Math.floor(Math.random() * evalData.rows.length);
  const randomRow = evalData.rows[randomIndex];

  console.log(
    `Selected random task ${randomIndex + 1}/${evalData.rows.length}`,
  );
  const success = await runSingleTask(randomRow.row);

  console.log(`\n🎯 Final Result: ${success ? "✅ Success" : "❌ Failed"}`);
}

(async () => {
  await runMind2WebTask();
})();
