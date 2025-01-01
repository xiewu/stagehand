import { Stagehand } from "../lib";
import { z } from "zod";
import dotenv from "dotenv";
import { Page } from '@playwright/test';
import fs from 'fs';

dotenv.config();

type AccessibilityNode = {
  role: string;
  name?: string;
  description?: string;
  value?: string;
  children?: AccessibilityNode[];
};

function buildHierarchicalTree(nodes: any[]): AccessibilityNode[] {
  const nodeMap = new Map<string, AccessibilityNode>();
  
  // First pass: Create all valid nodes
  nodes.forEach(node => {
    const hasChildren = node.childIds && node.childIds.length > 0;
    const hasValidName = node.name && node.name.trim() !== '';
    
    // Skip nodes that have no name and no children
    if (!hasValidName && !hasChildren) {
      return;
    }

    nodeMap.set(node.nodeId, {
      role: node.role,
      ...(hasValidName && { name: node.name }),
      ...(node.description && { description: node.description }),
      ...(node.value && { value: node.value })
    });
  });

  // Second pass: Build parent-child relationships
  nodes.forEach(node => {
    if (node.parentId && nodeMap.has(node.nodeId)) {
      const parentNode = nodeMap.get(node.parentId);
      const currentNode = nodeMap.get(node.nodeId);
      
      if (parentNode && currentNode) {
        if (!parentNode.children) {
          parentNode.children = [];
        }
        parentNode.children.push(currentNode);
      }
    }
  });

  // Third pass: Clean up generic and none nodes by lifting their children
  function cleanStructuralNodes(node: AccessibilityNode): AccessibilityNode | null {
    if (!node.children) {
      return (node.role === 'generic' || node.role === 'none') ? null : node;
    }

    const cleanedChildren = node.children
      .map(child => cleanStructuralNodes(child))
      .filter(Boolean) as AccessibilityNode[];

    if (node.role === 'generic' || node.role === 'none') {
      return cleanedChildren.length === 1 ? cleanedChildren[0] : 
             cleanedChildren.length > 1 ? { ...node, children: cleanedChildren } : 
             null;
    }

    return cleanedChildren.length > 0 ? { ...node, children: cleanedChildren } : node;
  }

  // Return only root nodes, cleaned of structural nodes
  return nodes
    .filter(node => !node.parentId && nodeMap.has(node.nodeId))
    .map(node => nodeMap.get(node.nodeId))
    .filter(Boolean)
    .map(node => cleanStructuralNodes(node))
    .filter(Boolean) as AccessibilityNode[];
}

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
      nodeId: node.nodeId,
      parentId: node.parentId,
      childIds: node.childIds,
    }));

    // Transform into hierarchical structure
    const hierarchicalTree = buildHierarchicalTree(sources);

    // Save the hierarchical accessibility tree to a JSON file
    fs.writeFileSync(
      'tree.json',
      JSON.stringify(hierarchicalTree, null, 2),
      'utf-8'
    );

    return hierarchicalTree;
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
    modelName: "gpt-4o-mini",
  });

  // Initialize the stagehand instance
  await stagehand.init();
  const page = stagehand.page;
  // // AI grant extract eval
  // await page.goto("https://aigrant.com/");
  // const companyList = await page.extract({
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

  // console.log(companyList.companies);
  // console.log(companyList.companies.length);


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
  //   useAccessibilityTree: true
  // });

  // console.log(result.primary_center_list);
  // console.log(result.primary_center_list.length);

  // await stagehand.page.goto(
  //   "https://www.tti.com/content/ttiinc/en/apps/part-detail.html?partsNumber=C320C104K5R5TA&mfgShortname=KEM&productId=6335148",
  // );

  // const result = await stagehand.extract({
  //   instruction:
  //     "Extract the TTI Part Number, Product Category, and minimum operating temperature of the capacitor.",
  //   schema: z.object({
  //     tti_part_number: z.string(),
  //     product_category: z.string(),
  //     min_operating_temp: z.string(),
  //   }),
  //   useTextExtract: false,
  //   useAccessibilityTree: true
  // });

  // console.log(result.tti_part_number);
  // console.log(result.product_category);
  // console.log(result.min_operating_temp);

  // await stagehand.page.goto("https://www.landerfornyc.com/news", {
  //   waitUntil: "networkidle",
  // });

  // const rawResult = await stagehand.extract({
  //   instruction:
  //     "extract the title and corresponding publish date of EACH AND EVERY press releases on this page. DO NOT MISS ANY PRESS RELEASES.",
  //   schema: z.object({
  //     items: z.array(
  //       z.object({
  //         title: z.string().describe("The title of the press release"),
  //         publish_date: z
  //           .string()
  //           .describe("The date the press release was published"),
  //       }),
  //     ),
  //   }),
  //   useTextExtract: false,
  //   useAccessibilityTree: true,
  // });
  
  // console.log(rawResult.items);
  // console.log(rawResult.items.length);

  // await stagehand.page.goto(
  //   "https://www.sars.gov.za/legal-counsel/secondary-legislation/public-notices/",
  //   { waitUntil: "networkidle" },
  // );

  // const result = await stagehand.extract({
  //   instruction:
  //     "Extract ALL the public notice descriptions with their corresponding, GG number and publication date. Extract ALL notices from 2024 through 2020. Do not include the Notice number.",
  //   schema: z.object({
  //     public_notices: z.array(
  //       z.object({
  //         notice_description: z
  //           .string()
  //           .describe(
  //             "the description of the notice. Do not include the Notice number",
  //           ),
  //         gg_number: z
  //           .string()
  //           .describe("the GG number of the notice. For example, GG 12345"),
  //         publication_date: z
  //           .string()
  //           .describe(
  //             "the publication date of the notice. For example, 8 December 2021",
  //           ),
  //       }),
  //     ),
  //   }),
  //   useTextExtract: false,
  //   useAccessibilityTree: true
  // });

  // console.log(result.public_notices);
  // console.log(result.public_notices.length);

  // await stagehand.page.goto(
  //   "http://www.dsbd.gov.za/index.php/research-reports",
  //   { waitUntil: "load" },
  // );

  // const result = await stagehand.extract({
  //   instruction:
  //     "Extract ALL the research report names. Do not extract the names of the PDF attachments.",
  //   schema: z.object({
  //     reports: z.array(
  //       z.object({
  //         report_name: z
  //           .string()
  //           .describe(
  //             "The name or title of the research report. NOT the name of the PDF attachment.",
  //           ),
  //       }),
  //     ),
  //   }),
  //   useTextExtract: false,
  //   useAccessibilityTree: true
  // });

  // console.log(result.reports);
  // console.log(result.reports.length);

  // await stagehand.page.goto(
  //   "https://www.cbisland.com/blog/10-snowshoeing-adventures-on-cape-breton-island/",
  // );

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
  
  await page.goto("https://panamcs.org/about/staff/");

  const result = await page.extract({
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

  // await stagehand.page.goto("https://www.seielect.com/?stockcheck=ASR1JA330R", { waitUntil: "networkidle" });

  // const result = await stagehand.extract({
  //   instruction:
  //     "Extract the MOQ, tolerance percentage, ohmic value, and operating temperature range of the resistor.",
  //   schema: z.object({
  //     moq: z.string(),
  //     tolerance_percentage: z.string(),
  //     ohmic_value: z.string(),
  //     operating_temperature_range: z.string(),
  //   }),
  //   useTextExtract: false,
  //   useAccessibilityTree: true
  // });

  // console.log(result.moq);
  // console.log(result.tolerance_percentage);
  // console.log(result.ohmic_value);
  // console.log(result.operating_temperature_range);

  // await stagehand.page.goto("https://www.jsc.gov.jo/Links2/en/Regulations");

  // const result = await stagehand.page.extract({
  //   instruction:
  //     "Extract the list of regulations with their descriptions and issue dates",
  //   schema: z.object({
  //     regulations: z.array(
  //       z.object({
  //         description: z.string(),
  //         issue_date: z.string(),
  //       }),
  //     ),
  //   }),
  //   useTextExtract: false,
  //   useAccessibilityTree: true
  // });

  // console.log(result.regulations);
  // console.log(result.regulations.length);

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
  //           // ...(node.properties && node.properties.length > 0 && { properties: node.properties }),
  //           // ...(node.description && { description: node.description })
  //       }));
  // // console.log(accessibilitySources.slice(400, 500));
  // console.log(meaningfulNodes.slice(300, 500));

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