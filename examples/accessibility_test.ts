import { Stagehand } from "../lib";
import { z } from "zod";
import dotenv from "dotenv";
import AxeBuilder from '@axe-core/playwright';
import { Page } from '@playwright/test';

dotenv.config();

async function getAccessibilityTree(page: Page) {
  const cdpClient = await page.context().newCDPSession(page);
  await cdpClient.send('Accessibility.enable');
  
  try {
    const { nodes } = await cdpClient.send('Accessibility.getFullAXTree');
    
    // Extract specific sources
    const sources = nodes.map(node => ({
      role: node.role?.value,
      name: node.name?.value,
      description: node.description?.value,
      value: node.value?.value,
      properties: node.properties,
      nodeId: node.nodeId,
      parentId: node.parentId,
      backendDOMNodeId: node.backendDOMNodeId,
      childIds: node.childIds,
    }));

    return sources;
  } finally {
    await cdpClient.send('Accessibility.disable');
  }
}

async function main() {
  // Initialize stagehand with local environment
  const stagehand = new Stagehand({ 
    env: "LOCAL", 
    debugDom: true,
    verbose: 1,
    modelName: "gpt-4o",
  });

  // Initialize the stagehand instance
  await stagehand.init();

  // // AI grant extract eval
  // await stagehand.page.goto("https://aigrant.com/");
  // const companyList = await stagehand.extract({
  //   instruction:
  //     "Extract all companies that received the AI grant and group them with their batch numbers as an array of objects. Each object should contain the company name and its corresponding batch number.",
  //   schema: z.object({
  //     companies: z.array(
  //       z.object({
  //         company: z.string(),
  //         batch: z.string(),
  //       }),
  //     ),
  //   }),
  //   useTextExtract: false,
  //   useAccessibilityTree: true
  // });

  // const companies = companyList.companies;
  // console.log("Extraction Result:", JSON.stringify(companies, null, 2));
  // console.log(companies.length);

  // await stagehand.page.goto(
  //   "https://www.cbisland.com/blog/10-snowshoeing-adventures-on-cape-breton-island/",
  // );

  // // await stagehand.act({ action: "reject the cookies" });
  // await new Promise(resolve => setTimeout(resolve, 2000));

  // const accessibilitySources = await getAccessibilityTree(stagehand.page);
  // const meaningfulNodes = accessibilitySources
  //       .filter(node => {
  //         return node.role !== 'none'
  //       })
  //       // .filter(node => {
  //       //     const name = node.name;
  //       //     return Boolean(
  //       //         name && 
  //       //         name !== '' && 
  //       //         name !== 'undefined'
  //       //         // node.role?.trim() &&
  //       //         // !/[\u{0080}-\u{FFFF}]/u.test(name)
  //       //     );
  //       // })
  //       .map(node => ({
  //           role: node.role,
  //           name: node.name,
  //           // name: node.name.replace(/[\u{0080}-\u{FFFF}]/gu, '').trim(),
  //           ...(node.properties && node.properties.length > 0 && { properties: node.properties }),
  //           // ...(node.description && { description: node.description })
  //       }));
  // // console.log(accessibilitySources.slice(400, 500));
  // console.log(meaningfulNodes.slice(50, 150));

  // const snowshoeing_regions = await stagehand.extract({
  //   instruction:
  //     "Extract all the snowshoeing regions and the names of the trails within each region.",
  //   schema: z.object({
  //     snowshoeing_regions: z.array(
  //       z.object({
  //         region_name: z
  //           .string()
  //           .describe("The name of the snowshoeing region"),
  //         trails: z
  //           .array(
  //             z.object({
  //               trail_name: z.string().describe("The name of the trail"),
  //             }),
  //           )
  //           .describe("The list of trails available in this region."),
  //       }),
  //     ),
  //   }),
  //   useTextExtract: false,
  //   useAccessibilityTree: true
  // });

  // console.log(snowshoeing_regions.snowshoeing_regions);
  // console.log(snowshoeing_regions.snowshoeing_regions.length);


  await stagehand.page.goto("https://panamcs.org/about/staff/");

  const result = await stagehand.extract({
    instruction:
      "extract a list of staff members on this page, with their name and their job title",
    schema: z.object({
      staff_members: z.array(
        z.object({
          name: z.string(),
          job_title: z.string(),
        }),
      ),
    }),
    useTextExtract:false,
    useAccessibilityTree: true
  });

  const staff_members = result.staff_members;
  console.log(JSON.stringify(staff_members, null, 2));
  console.log(staff_members.length);

  // const accessibilitySources = await getAccessibilityTree(stagehand.page);
  // const meaningfulNodes = accessibilitySources
  //   .filter(node => {
  //       const name = node.name?.trim();
  //       return Boolean(
  //           name && 
  //           name !== '' && 
  //           name !== '[]' &&
  //           node.role?.trim() &&
  //           !/[\u{0080}-\u{FFFF}]/u.test(name)
  //       );
  //   })
  //   .map(node => ({
  //       role: node.role,
  //       name: node.name.replace(/[\u{0080}-\u{FFFF}]/gu, '').trim(),
  //       // ...(node.properties && node.properties.length > 0 && { properties: node.properties }),
  //       // ...(node.description && { description: node.description })
  //   }));

  // console.log('Meaningful Nodes:', JSON.stringify(meaningfulNodes, null, 2));
  // console.log(meaningfulNodes.length);

  // await stagehand.page.goto("https://www.seielect.com/?stockcheck=ASR1JA330R");

  // const result = await stagehand.extract({
  //   instruction:
  //     "Extract the MOQ, tolerance percentage, ohmic value, and operating temperature range of the resistor.",
  //   schema: z.object({
  //     moq: z.string(),
  //     tolerance_percentage: z.string(),
  //     ohmic_value: z.string(),
  //     operating_temperature_range: z.string(),
  //   }),
  //   useTextExtract:false,
  //   useAccessibilityTree: true
  // });

  // const moq = result.moq;
  // console.log(moq);
  // console.log(result.tolerance_percentage);
  // console.log(result.ohmic_value);
  // console.log(result.operating_temperature_range);
  // console.log(result.ohmic_value);


  // await stagehand.page.goto(
  //   "https://www.ncc.gov.ng/technical-regulation/standards/numbering#area-codes-by-zone-primary-centre",
  //   { waitUntil: "domcontentloaded" },
  // );

  // const result = await stagehand.extract({
  //   instruction:
  //     "Extract ALL the Primary Center names and their corresponding Area Code, and the name of their corresponding Zone.",
  //   schema: z.object({
  //     primary_center_list: z.array(
  //       z.object({
  //         zone_name: z
  //           .string()
  //           .describe(
  //             "The name of the Zone that the Primary Center is in. For example, 'North Central Zone'.",
  //           ),
  //         primary_center_name: z
  //           .string()
  //           .describe(
  //             "The name of the Primary Center. I.e., this is the name of the city or town.",
  //           ),
  //         area_code: z
  //           .string()
  //           .describe(
  //             "The area code for the Primary Center. This will either be 2 or 3 digits.",
  //           ),
  //       }),
  //     ),
  //   }),
  //   useTextExtract: false,
  //   useAccessibilityTree: true,
  // });


  // const primaryCenterList = result.primary_center_list;
  // console.log(primaryCenterList.length);

  // Sample extract using accessibility tree
  // const result = await stagehand.extract({
  // Sample extract using accessibility tree
  // const result = await stagehand.extract({
  //   instruction: "Extract the main heading and any navigation links",
  //   schema: z.object({
  //     heading: z.string(),
  //     navigationLinks: z.array(z.string())
  //   }),
  //   useTextExtract: false,
  //   useAccessibilityTree: true
  // });

  // console.log("Extraction Result:", result);

  // const elements = await stagehand.observe({
  //   instruction: "Find the run now button",
  //   useAccessibilityTree: false
  // });

  // console.log("Elements:", elements);

  await new Promise(resolve => setTimeout(resolve, 200000));
  await stagehand.close();
}

(async () => {
  try {
    await main();
  } catch (error) {
    console.error(error);
  }
})();