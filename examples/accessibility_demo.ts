import { Stagehand } from "../lib";
import { z } from "zod";
import StagehandConfig from "./stagehand.config.js";
import dotenv from "dotenv";
dotenv.config();

import OpenAI from "openai";
import output from "string-comparison";


const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// console.log(OPENAI_API_KEY);

const prompts = {
  "act_prompt": `
You will be given a task and a website's page accessibility tree as context. Based on that information, you need to decide the next step action. ONLY RETURN THE NEXT STEP ACTION IN A SINGLE JSON.

When selecting elements, use elements from the accessibility tree.

Reflect on what you are seeing in the accessibility tree, elaborate on it in reasoning, and choose the next appropriate action.

Selectors must follow the format:
- For a button with a specific name: "button=ButtonName"
- For a placeholder (e.g., input field): "placeholder=PlaceholderText"
- For text: "text=VisibleText"

Make sure to analyze the accessibility tree and the screenshot to understand the current state, if something is not clear, you can use the previous actions to understand the current state. Explain why you are in the current state in current_state.

You will be given a task and you MUST return the next step action in JSON format:
{
    "current_state": "Where are you now? Analyze the accessibility tree and the screenshot to understand the current state.",
    "reasoning": "What is the next step to accomplish the task?",
    "action": "navigation" or "click" or "fill" or "finished",
    "url": "https://www.example.com", // Only for navigation actions
    "selector": "button=Click me", // For click or fill actions, derived from the accessibility tree
    "value": "Input text", // Only for fill actions
}

### Guidelines:
1. Use **"navigation"** for navigating to a new website through a URL.
2. Use **"click"** for interacting with clickable elements. Examples:
   - Buttons: "button=Click me"
   - Text: "text=VisibleText"
   - Placeholders: "placeholder=Search..."
   - Link: "link=BUY NOW"
3. Use **"fill"** for inputting text into editable fields. Examples:
   - Placeholder: "placeholder=Search..."
   - Textbox: "textbox=Flight destination output"
   - Input: "input=Search..."

Here is the accessibility tree:
{{accessibility_tree}}
`,
  "extract_prompt": "extract the repo 'about' value",
  "observe_prompt": ""
}

async function main() {
  // Initialize stagehand
  // You can mark debugDom: false to hide the debug rectangles
  // You can mark env: 'BROWSERBASE' to run on the cloud,
  //     provided you have BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID in your environment
  // Lastly, you can mark headless: true to run in headless mode
  const stagehand = new Stagehand({ env: "LOCAL", debugDom: true });

  // Initialize the stagehand instance
  await stagehand.init();

  // Navigate to a page
  // await stagehand.page.goto("https://www.github.com/browserbase");
  await stagehand.page.goto("https://www.browserbase.com");


  function cleanObject(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(cleanObject);
    }
    if (typeof obj === 'object' && obj !== null) {
      const cleaned = Object.fromEntries(
        Object.entries(obj)
          .filter(([_, value]) => value !== undefined)
          .map(([key, value]) => [key, cleanObject(value)])
      );
      // Preserve children as array if it exists
      if (obj.children) {
        cleaned.children = cleanObject(obj.children);
      }
      return cleaned;
    }
    return obj;
  }

  function printHierarchy(obj: any, level = 0, maxObjects = 30, counter = { count: 0 }): void {
    // Return early if we've reached the maximum number of objects
    if (counter.count >= maxObjects) {
        return;
    }

    const indent = '   '.repeat(level);
    
    if (Array.isArray(obj)) {
        obj.forEach(item => {
            if (counter.count < maxObjects) {
                printHierarchy(item, level, maxObjects, counter);
            }
        });
        return;
    }

    if (typeof obj === 'object' && obj !== null) {
        const { children, ...rest } = obj;
        console.log(indent + JSON.stringify(rest));
        counter.count++;
        
        if (children && counter.count < maxObjects) {
            printHierarchy(children, level + 1, maxObjects, counter);
        }
    }
  }

  function countSelectors(obj: any): number {
    let count = 0;
    
    // Check if current object is a selector (has role and name)
    if (obj.role && obj.name !== undefined) {
        count++;
    }
    
    // Recursively check children if they exist
    if (Array.isArray(obj.children)) {
        count += obj.children.reduce((sum: number, child: any) => sum + countSelectors(child), 0);
    }
    
    return count;
}

  function extractJSON(str: string): string {
    const matches = str.match(/\{[\s\S]*\}/);
    return matches ? matches[0] : str;
  }

  const N = 10; 

  const t1 = Date.now();
  const res = await stagehand.page.accessibility.snapshot();
  const cleanedRes = cleanObject(res);
  const t2 = Date.now();

  console.log("First", N, "elements from selectorMap");

  printHierarchy(cleanedRes, 0, N);

  // await stagehand.page.waitForLoadState("networkidle");

  // Process all DOM elements
  const t3 = Date.now();
  const { outputString, selectorMap } = await stagehand.page.evaluate(async () => {
    return window.processAllOfDom();
  });
  const t4 = Date.now();

  const limitedOutputString = outputString.split('\n').slice(0, N).join('\n');

  // console.log(outputString)
  
  console.log("First", N, "elements from outputString");
  console.log(limitedOutputString);


  console.log("\nAccessibility Tree:\nTime to get accessibility tree: ", t2 - t1);
  console.log("accessibility tree length: ", JSON.stringify(cleanedRes).length);
  console.log("Number of selectors: ", countSelectors(cleanedRes));

  console.log("\nDOM:\nTime to get dom: ", t4 - t3);
  console.log("dom length:", outputString.length);
  console.log("Number of selectors:", Object.keys(selectorMap).length);
  
  
  const system_prompt = prompts.act_prompt.replace("{{accessibility_tree}}", JSON.stringify(cleanedRes)); 
  // console.log(system_prompt);

  const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
  });
  const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
          {"role": "system", "content": system_prompt},
          // {"role": "user", "content": "Click on the stagehand repo"},
          {"role": "user", "content": "Click on sign up"}
      ],
      temperature: 0.1,
  });

  // console.log(completion.choices[0].message.content);
  try {
    const cleanedContent = extractJSON(completion.choices[0].message.content);
    const action = JSON.parse(cleanedContent);
    console.log(action);
    if (action.action === "click") {
      const selector = action.selector.split('=');
      const selector_type = selector[0];
      const selector_value = selector[1];
      try { 
        await stagehand.page.getByRole(selector_type, { name: selector_value }).click();
        console.log("Clicked on", selector_value);
      } catch (error) {
        console.error("\n\n\nError clicking on", selector_value, error);
        await stagehand.page.getByRole(selector_type, { name: selector_value }).first().click();
        console.log("\n\nClicked on first selector for:", selector_value);
      }
    }
  } catch (error) {
    console.error("Error parsing JSON:", error);
  }

  // await new Promise(resolve=>setTimeout(resolve, 1000));

  // const res2 = await stagehand.page.accessibility.snapshot();
  // const cleanedRes2 = cleanObject(res2);
  // // printHierarchy(cleanedRes2);
  
  // const system_prompt2 = prompts.act_prompt.replace("{{accessibility_tree}}", JSON.stringify(cleanedRes2)); 
  // console.log(system_prompt2);

  // const completion2 = await openai.chat.completions.create({
  //     model: "gpt-4o-mini",
  //     messages: [
  //         {"role": "system", "content": system_prompt2},
  //         {"role": "user", "content": "Click on the lib directory"}
  //     ],
  //     temperature: 0.1,
  // });

  // console.log(completion2.choices[0].message.content);
  // try {
  //   const cleanedContent2 = extractJSON(completion2.choices[0].message.content);
  //   const action2 = JSON.parse(cleanedContent2);
  //   console.log(action2);
  //   if (action2.action === "click") {
  //     const selector2 = action2.selector.split('=');
  //     const selector_type2 = selector2[0];
  //     const selector_value2 = selector2[1];
  //     try { 
  //       await stagehand.page.getByRole(selector_type2, { name: selector_value2 }).click();
  //       console.log("Clicked on", selector_value2);
  //     } catch (error) {
  //       console.error("Error clicking on", selector_value2, error);
  //       await stagehand.page.getByRole(selector_type2, { name: selector_value2 }).first().click();
  //     }
  //   }
  // } catch (error) {
  //   console.error("Error parsing JSON:", error);
  // }
  
  



  // await stagehand.page.getByRole('link', { name: 'stagehand' }).first().click();

  // Act on the page
  // await stagehand.act({
  //   action: "Click on the stagehand repo",
  // });

  // // Extract data from the page
  // // This will return an object in the form { about: "..." }
  // const { about } = await stagehand.extract({
  //   instruction: "extract the repo 'about' value",
  //   schema: z.object({
  //     about: z.string(),
  //   }),
  // });

  // console.log(`Stagehand: ${about}`);

  // The browser session will close automatically when the script finishes,
  // but you can also close it manually.
 

  await new Promise(resolve => setTimeout(resolve, 10000));
  await stagehand.close();
}

(async () => {
  try {
    await main();
  } catch (error) {
    console.error(error);
  }
})();