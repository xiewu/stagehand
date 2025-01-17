import { LogLine } from "../../types/log";
import { Stagehand } from "../index";
import { observe } from "../inference";
import { LLMClient } from "../llm/LLMClient";
import { StagehandPage } from "../StagehandPage";
import { generateId } from "../utils";
import { ScreenshotService } from "../vision";
import { CDPSession } from "playwright";

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
  private readonly userProvidedInstructions?: string;
  constructor({
    stagehand,
    logger,
    stagehandPage,
    userProvidedInstructions,
  }: {
    stagehand: Stagehand;
    logger: (logLine: LogLine) => void;
    stagehandPage: StagehandPage;
    userProvidedInstructions?: string;
  }) {
    this.stagehand = stagehand;
    this.logger = logger;
    this.stagehandPage = stagehandPage;
    this.userProvidedInstructions = userProvidedInstructions;
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

  public async observe({
    instruction,
    useVision,
    fullPage,
    llmClient,
    requestId,
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

    let outputString: string;
    let selectorMap: Record<string, string[]> = {};
    const backendNodeIdMap: Record<string, number> = {};

    await this.stagehandPage.startDomDebug();
    const cdpClient = await this.stagehandPage.context.newCDPSession(
      this.stagehandPage.page,
    );
    await cdpClient.send("DOM.enable");

    const evalResult = await this.stagehand.page.evaluate(async () => {
      const result = await window.processAllOfDom();
      return result;
    });

    // For each element in the selector map, get its backendNodeId
    for (const [index, xpaths] of Object.entries(evalResult.selectorMap)) {
      try {
        // Use the first xpath to find the element
        const xpath = xpaths[0];
        const { result } = await cdpClient.send("Runtime.evaluate", {
          expression: `document.evaluate('${xpath}', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue`,
          returnByValue: false,
        });

        if (result.objectId) {
          // Get the node details using CDP
          const { node } = await cdpClient.send("DOM.describeNode", {
            objectId: result.objectId,
            depth: -1,
            pierce: true,
          });

          if (node.backendNodeId) {
            backendNodeIdMap[index] = node.backendNodeId;
          }
        }
      } catch (error) {
        console.warn(
          `Failed to get backendNodeId for element ${index}:`,
          error,
        );
        continue;
      }
    }

    await cdpClient.send("DOM.disable");
    ({ outputString, selectorMap } = evalResult);

    if (useAccessibilityTree) {
      console.log("Getting accessibility tree...");
      const tree = await getAccessibilityTree(this.stagehandPage);

      this.logger({
        category: "observation",
        message: "Getting accessibility tree data",
        level: 1,
      });

      outputString = tree.simplified;
    }

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
      userProvidedInstructions: this.userProvidedInstructions,
      logger: this.logger,
      isUsingAccessibilityTree: useAccessibilityTree,
    });
    console.log(
      `\n\nobservationResponse: ${JSON.stringify(observationResponse)}`,
    );
    const elementsWithSelectors = await Promise.all(
      observationResponse.elements.map(async (element) => {
        const { elementId, ...rest } = element;

        if (useAccessibilityTree) {
          const index = Object.entries(backendNodeIdMap).find(
            ([, value]) => value === elementId,
          )?.[0];
          if (!index || !selectorMap[index]?.[0]) {
            // Generate xpath for the given element if not found in selectorMap
            const { object } = await cdpClient.send("DOM.resolveNode", {
              backendNodeId: elementId,
            });
            const xpath = await getXPathByResolvedObjectId(
              cdpClient,
              object.objectId,
            );
            return {
              ...rest,
              selector: xpath,
              backendNodeId: elementId,
            };
          }
          return {
            ...rest,
            selector: `xpath=${selectorMap[index][0]}`,
            backendNodeId: elementId,
          };
        }

        return {
          ...rest,
          selector: `xpath=${selectorMap[elementId][0]}`,
          backendNodeId: backendNodeIdMap[elementId],
        };
      }),
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
  childIds?: string[];
  parentId?: string;
  nodeId?: string;
};

interface TreeResult {
  tree: AccessibilityNode[];
  simplified: string;
}

// Parser function for str output
function formatSimplifiedTree(node: AccessibilityNode, level = 0): string {
  const indent = "  ".repeat(level);
  let result = `${indent}[${node.nodeId}] ${node.role}${node.name ? `: ${node.name}` : ""}\n`;

  if (node.children?.length) {
    result += node.children
      .map((child) => formatSimplifiedTree(child, level + 1))
      .join("");
  }
  return result;
}

// Constructs the hierarchichal representation of the a11y tree
function buildHierarchicalTree(nodes: AccessibilityNode[]): TreeResult {
  const nodeMap = new Map<string, AccessibilityNode>();

  // First pass: Create all important nodes
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
  // console.log(nodeMap);

  nodes
    .filter((node) => !node.parentId && nodeMap.has(node.nodeId))
    .map((node) => nodeMap.get(node.nodeId))
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

  const finalTree = nodes
    .filter((node) => !node.parentId && nodeMap.has(node.nodeId))
    .map((node) => nodeMap.get(node.nodeId))
    .filter(Boolean)
    .map((node) => cleanStructuralNodes(node))
    .filter(Boolean) as AccessibilityNode[];

  const simplifiedFormat = finalTree
    .map((node) => formatSimplifiedTree(node))
    .join("\n");

  return {
    tree: finalTree,
    simplified: simplifiedFormat,
  };
}

async function getAccessibilityTree(page: StagehandPage) {
  console.log("Starting getAccessibilityTree");
  const cdpClient = await page.context.newCDPSession(page.page);
  await cdpClient.send("Accessibility.enable");

  try {
    const { nodes } = await cdpClient.send("Accessibility.getFullAXTree");

    // Extract specific sources
    const sources = nodes.map((node) => ({
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

    return hierarchicalTree;
  } catch (error) {
    console.error("Error in getAccessibilityTree:", error);
    throw error;
  } finally {
    await cdpClient.send("Accessibility.disable");
  }
}

async function getXPathByResolvedObjectId(
  cdpClient: CDPSession,
  resolvedObjectId: string,
): Promise<string> {
  const { result } = await cdpClient.send("Runtime.callFunctionOn", {
    objectId: resolvedObjectId,
    functionDeclaration: `function() {
      function getNodePath(node) {
        const parts = [];
        let current = node;
        
        while (current && current.parentNode) {
          if (current.nodeType === Node.ELEMENT_NODE) {
            let tagName = current.tagName.toLowerCase();
            let sameTagSiblings = Array.from(current.parentNode.children).filter(
              child => child.tagName === current.tagName
            );
            
            if (sameTagSiblings.length > 1) {
              let index = 1;
              for (let sibling of sameTagSiblings) {
                if (sibling === current) break;
                index++;
              }
              tagName += '[' + index + ']';
            }
            
            parts.unshift(tagName);
          }
          current = current.parentNode;
        }
        
        return '/' + parts.join('/');
      }
      
      return getNodePath(this);
    }`,
    returnByValue: true,
  });

  return result.value || "";
}
