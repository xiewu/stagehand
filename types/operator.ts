import { z } from "zod";

export const operatorResponseSchema = z.object({
  reasoning: z.string().describe("The reasoning for the step taken"),
  method: z.enum([
    "act",
    "extract",
    "goto",
    "close",
    "wait",
    "navback",
    "refresh",
  ])
    .describe(`The action to perform on the page based off of the goal and the current state of the page.
      goto: Navigate to a specific URL.
      act: Perform an action on the page.  
      extract: Extract data from the page.
      close: The task is complete, close the browser.
      wait: Wait for a period of time.
      navback: Navigate back to the previous page. Do not navigate back if you are already on the first page.
      refresh: Refresh the page.`),
  parameters: z
    .string()
    .describe(
      `The parameter for the action. Only pass in a parameter for the following methods:
        - act: The action to perform. e.g. "click on the submit button" or "type [email] into the email input field and press enter"
        - extract: The data to extract. e.g. "the title of the article". If you want to extract all of the text on the page, leave this undefined.
        - wait: The amount of time to wait in milliseconds.
        - goto: The URL to navigate to. e.g. "https://www.google.com"
        The other methods do not require a parameter.`,
    )
    .optional(),
  taskComplete: z
    .boolean()
    .describe(
      "Whether the task is complete. If true, the task is complete and the browser should be closed. If you chose to close the browser because the task failed, set this to false.",
    ),
});

export type OperatorResponse = z.infer<typeof operatorResponseSchema>;
