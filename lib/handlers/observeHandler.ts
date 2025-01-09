import { LogLine } from "../../types/log";
import { Stagehand } from "../index";
import { observe } from "../inference";
import { LLMClient } from "../llm/LLMClient";
import { generateId } from "../utils";
import { ScreenshotService } from "../vision";
import { StagehandPage } from "../StagehandPage";



export class StagehandObserveHandler {
  private readonly stagehand: Stagehand;
  private readonly logger: (logLine: LogLine) => void;
  private readonly stagehandPage: StagehandPage;
  private readonly verbose: 0 | 1 | 2;
  private observations: {
    [key: string]: {
      result: { selector: string; description: string }[];
      instruction: string;
    };
  };

  constructor({
    stagehand,
    logger,
    stagehandPage,
  }: {
    stagehand: Stagehand;
    logger: (logLine: LogLine) => void;
    stagehandPage: StagehandPage;
  }) {
    this.stagehand = stagehand;
    this.logger = logger;
    this.stagehandPage = stagehandPage;
    this.observations = {};
  }

  private async _recordObservation(
    instruction: string,
    result: { selector: string; description: string }[],
  ): Promise<string> {
    const id = generateId(instruction);

    this.observations[id] = { result, instruction };

    return id;
  }

  private async processAccessibilityTree(tree: AccessibilityNode[]) {
    const selectorMap: Record<string, string[]> = {};
    
    // Get CDP client to convert backendDOMNodeId to page element
    const cdpClient = await this.stagehandPage.context.newCDPSession(this.stagehandPage.page);
    
    for (const node of tree) {
      if (node.nodeId) {
        try {
          // Get the remote object for this node
          const { object } = await cdpClient.send('DOM.resolveNode', {
            backendNodeId: Number(node.nodeId)
          });
          console.log(object);
          // Get element's XPath
          if (object.objectId) {
            const { result } = await cdpClient.send('Runtime.callFunctionOn', {
              functionDeclaration: `
                function() {
                  function generateXPathsForElement(element) {
                    if (!(element instanceof Element)) return [];
                    
                    const paths = [];
                    
                    // Try ID
                    if (element.id) {
                      paths.push(\`//*[@id="\${element.id}"]\`);
                    }
                    
                    // Try basic XPath
                    let path = '';
                    for (let elem = element; elem && elem.nodeType === 1; elem = elem.parentNode) {
                      let idx = 1;
                      for (let sibling = elem.previousSibling; sibling; sibling = sibling.previousSibling) {
                        if (sibling.nodeType === 1 && sibling.tagName === elem.tagName) idx++;
                      }
                      const tagName = elem.tagName.toLowerCase();
                      path = \`/\${tagName}[\${idx}]\${path}\`;
                    }
                    if (path) paths.push(path);
                    
                    return paths;
                  }
                  return generateXPathsForElement(this);
                }
              `,
              objectId: object.objectId
            });
            
            if (result.value) {
              selectorMap[node.nodeId] = result.value;
            }
          }
        } catch (error) {
          console.warn(`Failed to process node ${node.nodeId}:`, error);
          continue;
        }
      }
    }

    return {
      selectorMap,
      outputString: buildHierarchicalTree(tree).simplified
    };
  }

  public async observe({
    instruction,
    useVision,
    fullPage,
    llmClient,
    requestId,
    domSettleTimeoutMs,
    useAccessibilityTree = false,
  }: {
    instruction: string;
    useVision: boolean;
    fullPage: boolean;
    llmClient: LLMClient;
    requestId: string;
    domSettleTimeoutMs?: number;
    useAccessibilityTree?: boolean;
  }) {
    if (!instruction) {
      instruction = `Find elements that can be used for any future actions in the page. These may be navigation links, related pages, section/subsection links, buttons, or other interactive elements. Be comprehensive: if there are multiple elements that may be relevant for future actions, return all of them.`;
    }
    this.logger({
      category: "observation",
      message: "starting observation",
      level: 1,
      auxiliary: {
        instruction: {
          value: instruction,
          type: "string",
        },
      },
    });

    // await this.stagehandPage._waitForSettledDom(domSettleTimeoutMs);
    // await this.stagehandPage.startDomDebug();
    // const evalResult = await this.stagehand.page.evaluate(
    //   (fullPage: boolean) =>
    //     fullPage ? window.processAllOfDom() : window.processDom([]),
    //   fullPage,
    // );

    let outputString: string;
    let selectorMap: Record<string, string[]> = {};
    let accessibilityData = "";
    if (useAccessibilityTree) {
      console.log("Getting accessibility tree...");
      const tree = await getAccessibilityTree(this.stagehandPage);
      console.log("Simplified tree:", JSON.stringify(tree.tree, null, 2));
      
      // const { outputString: accOutput, selectorMap: accSelectors } = 
      //   await this.processAccessibilityTree(tree.tree);
      // console.log("Processed tree output:", accOutput);
      
      // outputString = accOutput;
      // selectorMap = accSelectors;

      this.logger({
        category: "observation",
        message: "Getting accessibility tree data",
        level: 1,
      });
      // const tree = await getAccessibilityTree(this.stagehandPage);
      accessibilityData = "\n\nAccessibility Tree:\n" + tree.simplified;

    } else {
      await this.stagehandPage.startDomDebug();
      const evalResult = await this.stagehand.page.evaluate(
        (fullPage: boolean) =>
          fullPage ? window.processAllOfDom() : window.processDom([]),
        fullPage,
      );
      ({ outputString, selectorMap } = evalResult);
    }

    outputString += accessibilityData;

    let annotatedScreenshot: Buffer | undefined;
    if (useVision === true) {
      if (!llmClient.hasVision) {
        this.logger({
          category: "observation",
          message: "Model does not support vision. Skipping vision processing.",
          level: 1,
          auxiliary: {
            model: {
              value: llmClient.modelName,
              type: "string",
            },
          },
        });
      } else {
        const screenshotService = new ScreenshotService(
          this.stagehand.page,
          selectorMap,
          this.verbose,
          this.logger,
        );

        annotatedScreenshot =
          await screenshotService.getAnnotatedScreenshot(fullPage);
        outputString = "n/a. use the image to find the elements.";
      }
    }

    const observationResponse = await observe({
      instruction,
      domElements: outputString,
      llmClient,
      image: annotatedScreenshot,
      requestId,
      isUsingAccessibilityTree: useAccessibilityTree,
    });
    console.log(
      `\n\nobservationResponse: ${JSON.stringify(observationResponse)}`,
    );
    const elementsWithSelectors = observationResponse.elements.map(
      (element) => {
        const { elementId, ...rest } = element;

        if (useAccessibilityTree) {
          return {
            ...rest,
            selector: selectorMap[elementId][0],
          };
        }

        return {
          ...rest,
          selector: `xpath=${selectorMap[elementId][0]}`,
        };
      },
    );

    await this.stagehandPage.cleanupDomDebug();

    this.logger({
      category: "observation",
      message: "found elements",
      level: 1,
      auxiliary: {
        elements: {
          value: JSON.stringify(elementsWithSelectors),
          type: "object",
        },
      },
    });

    await this._recordObservation(instruction, elementsWithSelectors);
    return elementsWithSelectors;
  }
}

type AccessibilityNode = {
  role: string;
  name?: string;
  description?: string;
  value?: string;
  children?: AccessibilityNode[];
  nodeId?: string;
};

interface TreeResult {
  tree: AccessibilityNode[];
  simplified: string;
}

function formatSimplifiedTree(node: AccessibilityNode, level = 0): string {
  const indent = '  '.repeat(level);
  let result = `${indent}${node.role}${node.name ? `: ${node.name}` : ''}\n`;
  
  if (node.children?.length) {
    result += node.children.map(child => formatSimplifiedTree(child, level + 1)).join('');
  }
  return result;
}

function buildHierarchicalTree(nodes: any[]): TreeResult {
  const nodeMap = new Map<string, AccessibilityNode>();

  // First pass: Create all valid nodes
  nodes.forEach((node) => {
    const hasChildren = node.childIds && node.childIds.length > 0;
    const hasValidName = node.name && node.name.trim() !== "";

    // Skip nodes that have no name and no children
    if (!hasValidName && !hasChildren) {
      return;
    }

    nodeMap.set(node.nodeId, {
      role: node.role,
      nodeId: node.nodeId,
      ...(hasValidName && { name: node.name }),
      ...(node.description && { description: node.description }),
      ...(node.value && { value: node.value }),
    });
  });

  // Second pass: Build parent-child relationships
  nodes.forEach((node) => {
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
  console.log(nodeMap);

  // fs.writeFileSync(
  //   "../full_tree.json",
  //   JSON.stringify(nodes, null, 2),
  //   "utf-8",
  // );
  const initialTree = nodes
    .filter(node => !node.parentId && nodeMap.has(node.nodeId))
    .map(node => nodeMap.get(node.nodeId))
    .filter(Boolean) as AccessibilityNode[];

  // Third pass: Clean up generic and none nodes by lifting their children
  function cleanStructuralNodes(
    node: AccessibilityNode,
  ): AccessibilityNode | null {
    if (!node.children) {
      return node.role === "generic" || node.role === "none" ? null : node;
    }

    const cleanedChildren = node.children
      .map((child) => cleanStructuralNodes(child))
      .filter(Boolean) as AccessibilityNode[];

    if (node.role === "generic" || node.role === "none") {
      return cleanedChildren.length === 1
        ? cleanedChildren[0]
        : cleanedChildren.length > 1
          ? { ...node, children: cleanedChildren }
          : null;
    }

    return cleanedChildren.length > 0
      ? { ...node, children: cleanedChildren }
      : node;
  }

  // // Return only root nodes, cleaned of structural nodes
  // return nodes
  //   .filter((node) => !node.parentId && nodeMap.has(node.nodeId))
  //   .map((node) => nodeMap.get(node.nodeId))
  //   .filter(Boolean)
  //   .map((node) => cleanStructuralNodes(node))
  //   .filter(Boolean) as AccessibilityNode[];

  const finalTree = nodes
  .filter(node => !node.parentId && nodeMap.has(node.nodeId))
  .map(node => nodeMap.get(node.nodeId))
  .filter(Boolean)
  .map(node => cleanStructuralNodes(node))
  .filter(Boolean) as AccessibilityNode[];

  const simplifiedFormat = finalTree.map(node => formatSimplifiedTree(node)).join('\n');
  console.log(simplifiedFormat);

  return {
    tree: finalTree,
    simplified: simplifiedFormat
  };
}

async function getAccessibilityTree(page: StagehandPage) {
  console.log("Starting getAccessibilityTree");
  const cdpClient = await page.context.newCDPSession(page.page);
  await cdpClient.send("Accessibility.enable");

  try {
    const { nodes } = await cdpClient.send("Accessibility.getFullAXTree");
    console.log("Got raw nodes:", nodes.length);

    const sources = nodes.map((node) => ({
      role: node.role?.value,
      name: node.name?.value,
      description: node.description?.value,
      value: node.value?.value,
      nodeId: node.nodeId,
      parentId: node.parentId,
      childIds: node.childIds,
    }));
    console.log("Processed sources:", sources.length);

    const hierarchicalTree = buildHierarchicalTree(sources);
    console.log("Built hierarchical tree");

    return hierarchicalTree;
  } catch (error) {
    console.error("Error in getAccessibilityTree:", error);
    throw error;
  } finally {
    await cdpClient.send("Accessibility.disable");
  }
}