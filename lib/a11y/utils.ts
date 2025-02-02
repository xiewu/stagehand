import { AccessibilityNode, TreeResult, AXNode } from "../../types/context";
import { StagehandPage } from "../StagehandPage";
import { LogLine } from "../../types/log";
import { CDPSession, Page, Locator, ElementHandle } from "playwright";
import {
  PlaywrightCommandMethodNotSupportedException,
  PlaywrightCommandException,
} from "@/types/playwright";

// Parser function for str output
export function formatSimplifiedTree(
  node: AccessibilityNode,
  level = 0,
): string {
  const indent = "  ".repeat(level);
  let result = `${indent}[${node.nodeId}] ${node.role}${node.name ? `: ${node.name}` : ""}\n`;

  if (node.children?.length) {
    result += node.children
      .map((child) => formatSimplifiedTree(child, level + 1))
      .join("");
  }
  return result;
}

/**
 * Helper function to remove or collapse unnecessary structural nodes
 * Handles three cases:
 * 1. Removes generic/none nodes with no children
 * 2. Collapses generic/none nodes with single child
 * 3. Keeps generic/none nodes with multiple children but cleans their subtrees
 */
function cleanStructuralNodes(
  node: AccessibilityNode,
): AccessibilityNode | null {
  // Base case: leaf node
  if (!node.children) {
    return node.role === "generic" || node.role === "none" ? null : node;
  }

  // Recursively clean children
  const cleanedChildren = node.children
    .map((child) => cleanStructuralNodes(child))
    .filter(Boolean) as AccessibilityNode[];

  // Handle generic/none nodes specially
  if (node.role === "generic" || node.role === "none") {
    if (cleanedChildren.length === 1) {
      // Collapse single-child generic nodes
      return cleanedChildren[0];
    } else if (cleanedChildren.length > 1) {
      // Keep generic nodes with multiple children
      return { ...node, children: cleanedChildren };
    }
    // Remove generic nodes with no children
    return null;
  }

  // For non-generic nodes, keep them if they have children after cleaning
  return cleanedChildren.length > 0
    ? { ...node, children: cleanedChildren }
    : node;
}

/**
 * Builds a hierarchical tree structure from a flat array of accessibility nodes.
 * The function processes nodes in multiple passes to create a clean, meaningful tree.
 * @param nodes - Flat array of accessibility nodes from the CDP
 * @returns Object containing both the tree structure and a simplified string representation
 */
export function buildHierarchicalTree(nodes: AccessibilityNode[]): TreeResult {
  // Map to store processed nodes for quick lookup
  const nodeMap = new Map<string, AccessibilityNode>();

  // First pass: Create nodes that are meaningful
  // We only keep nodes that either have a name or children to avoid cluttering the tree
  nodes.forEach((node) => {
    const hasChildren = node.childIds && node.childIds.length > 0;
    const hasValidName = node.name && node.name.trim() !== "";

    // Skip nodes that have no semantic value (no name and no children)
    if (!hasValidName && !hasChildren) {
      return;
    }

    // Create a clean node object with only relevant properties
    nodeMap.set(node.nodeId, {
      role: node.role,
      nodeId: node.nodeId,
      ...(hasValidName && { name: node.name }), // Only include name if it exists and isn't empty
      ...(node.description && { description: node.description }),
      ...(node.value && { value: node.value }),
    });
  });

  // Second pass: Establish parent-child relationships
  // This creates the actual tree structure by connecting nodes based on parentId
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

  // Final pass: Build the root-level tree and clean up structural nodes
  const finalTree = nodes
    .filter((node) => !node.parentId && nodeMap.has(node.nodeId)) // Get root nodes
    .map((node) => nodeMap.get(node.nodeId))
    .filter(Boolean)
    .map((node) => cleanStructuralNodes(node))
    .filter(Boolean) as AccessibilityNode[];

  // Generate a simplified string representation of the tree
  const simplifiedFormat = finalTree
    .map((node) => formatSimplifiedTree(node))
    .join("\n");

  return {
    tree: finalTree,
    simplified: simplifiedFormat,
    backendNodeMap: nodeMap,
  };
}

export async function getAccessibilityTree(
  page: StagehandPage,
  logger: (logLine: LogLine) => void,
): Promise<TreeResult> {
  await page.enableCDP("Accessibility");

  try {
    const { nodes } = await page.sendCDP<{ nodes: AXNode[] }>(
      "Accessibility.getFullAXTree",
    );

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
    logger({
      category: "observation",
      message: "Error getting accessibility tree",
      level: 1,
      auxiliary: {
        error: {
          value: error.message,
          type: "string",
        },
        trace: {
          value: error.stack,
          type: "string",
        },
      },
    });
    throw error;
  } finally {
    await page.disableCDP("Accessibility");
  }
}

// This function is wrapped into a string and sent as a CDP command
// It is not meant to be actually executed here
function getNodePath(el: Element) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return "";
  const pathSegments = [];
  let current = el;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const tagName = current.nodeName.toLowerCase();
    let index = 1;
    let sibling = current.previousSibling;
    while (sibling) {
      if (
        sibling.nodeType === Node.ELEMENT_NODE &&
        sibling.nodeName.toLowerCase() === tagName
      ) {
        index++;
      }
      sibling = sibling.previousSibling;
    }
    const segment = index > 1 ? tagName + "[" + index + "]" : tagName;
    pathSegments.unshift(segment);
    current = current.parentNode as Element;
    if (!current || !current.parentNode) break;
    if (current.nodeName.toLowerCase() === "html") {
      pathSegments.unshift("html");
      break;
    }
  }
  return "/" + pathSegments.join("/");
}

const functionString = getNodePath.toString();

export async function getXPathByResolvedObjectId(
  cdpClient: CDPSession,
  resolvedObjectId: string,
): Promise<string> {
  const { result } = await cdpClient.send("Runtime.callFunctionOn", {
    objectId: resolvedObjectId,
    functionDeclaration: `function() {
      ${functionString}
      return getNodePath(this);
    }`,
    returnByValue: true,
  });

  return result.value || "";
}

/**
 * Extracts all scrollable elements on the page by calling
 * `window.getScrollableElements()` in the browser context.
 *
 * @param stagehandPage - The StagehandPage instance to run page-level commands.
 * @returns An array of ElementHandles for all scrollable elements found.
 */
async function extractScrollableElements(
  stagehandPage: StagehandPage,
): Promise<ElementHandle<Element>[]> {
  const scrollableElementsHandle = await stagehandPage.page.evaluateHandle(
    () => {
      return window.getScrollableElements();
    },
  );

  const properties = await scrollableElementsHandle.getProperties();
  const scrollableElements: ElementHandle<Element>[] = [];

  for (const prop of properties.values()) {
    const elementHandle = prop.asElement();
    if (elementHandle) {
      scrollableElements.push(elementHandle);
    }
  }

  return scrollableElements;
}

/**
 * Accepts an array of scrollable ElementHandles and resolves each one
 * **directly** to an accessibility node ID (AX nodeId) by:
 *   1. Generating XPaths for the element.
 *   2. Using the first XPath to `document.evaluate` it in CDP (Runtime.evaluate).
 *   3. Calling `Accessibility.getPartialAXTree({ objectId })` to retrieve the AX node info.
 *
 * @param stagehandPage - The StagehandPage instance to run CDP commands.
 * @param elements - An array of scrollable ElementHandles to process.
 * @returns An array of AX node IDs for each element (skips any that fail).
 */
async function getAxNodeIdsForElements(
  stagehandPage: StagehandPage,
  elements: ElementHandle<Element>[],
): Promise<string[]> {
  const axIds = await Promise.all(
    elements.map(async (el) => {
      // 1. Generate all possible XPaths for the element
      const xpaths: string[] = await el.evaluate((node) => {
        return window.generateXPathsForElement(node);
      });

      // If we have no valid XPath, skip this element
      if (!xpaths || !xpaths.length) {
        return null;
      }

      // Use the first XPath
      const xpath = xpaths[0];

      // 2. Evaluate the XPath to get an objectId via CDP
      const evalResponse = await stagehandPage.sendCDP<{
        result: { objectId: string };
      }>("Runtime.evaluate", {
        expression: `document.evaluate(${JSON.stringify(
          xpath,
        )}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue`,
        returnByValue: false,
      });

      if (!evalResponse?.result?.objectId) {
        return null;
      }

      // 3. Call Accessibility.getPartialAXTree with the objectId
      const partialAxResponse = await stagehandPage.sendCDP<{
        nodes: AXNode[];
      }>("Accessibility.getPartialAXTree", {
        objectId: evalResponse.result.objectId,
        fetchRelatives: false,
      });

      // The first node is typically the AX node for our element
      const axNode = partialAxResponse?.nodes?.[0];
      return axNode?.nodeId || null;
    }),
  );

  // Filter out null results
  return axIds.filter((id): id is string => id !== null);
}

/**
 * Formats a single AX node into a compact one-line representation.
 * Example: "[1234] generic: MyNodeName"
 *
 * @param axNode - The accessibility node to format.
 * @returns A string with ID, role, and optional name.
 */
function formatSingleNode(axNode: AccessibilityNode): string {
  return `[${axNode.nodeId}] ${axNode.role}${axNode.name ? `: ${axNode.name}` : ""}`;
}

/**
 * Retrieves the accessibility-node representations of all scrollable elements on the page,
 * using a direct approach (CDP's Accessibility domain) to get each element's AX node ID.
 *
 * Steps:
 *   1. Calls a page-level function to get a list of scrollable elements (ElementHandles).
 *   2. Resolves each element directly to its AX node ID via `getAxNodeIdsForElements`.
 *   3. Looks up each AX nodeId in `backendNodeMap`, which is keyed by AX node IDs.
 *   4. Formats each node into a single-line string (no recursion).
 *   5. Joins all strings with newlines.
 *
 * @param stagehandPage - An instance of StagehandPage to run CDP commands.
 * @param backendNodeMap - A map of AX node IDs to AccessibilityNodes for the current page.
 * @returns A joined string containing the AX representation of each scrollable element.
 */
export async function getScrollableElementsAXNodes(
  stagehandPage: StagehandPage,
  backendNodeMap: Map<string, AccessibilityNode>,
): Promise<string> {
  // 1. Extract scrollable elements as ElementHandles
  const scrollableElements = await extractScrollableElements(stagehandPage);

  // 2. Convert those ElementHandles directly to AX node IDs
  const scrollableAxIds = await getAxNodeIdsForElements(
    stagehandPage,
    scrollableElements,
  );

  // 3 & 4. For each AX nodeId, look up the node in backendNodeMap and format a single-line string
  const scrollableAXNodesArray = scrollableAxIds.map((axId) => {
    const axNode = backendNodeMap.get(axId);
    return axNode
      ? formatSingleNode(axNode)
      : `Unknown AX node for nodeId: [${axId}]`;
  });

  // 5. Return the combined output
  return scrollableAXNodesArray.join("\n");
}

export async function performPlaywrightMethod(
  stagehandPage: Page,
  logger: (logLine: LogLine) => void,
  method: string,
  args: unknown[],
  xpath: string,
  // domSettleTimeoutMs?: number,
) {
  const locator = stagehandPage.locator(`xpath=${xpath}`).first();
  const initialUrl = stagehandPage.url();

  logger({
    category: "action",
    message: "performing playwright method",
    level: 2,
    auxiliary: {
      xpath: {
        value: xpath,
        type: "string",
      },
      method: {
        value: method,
        type: "string",
      },
    },
  });

  if (method === "scrollIntoView") {
    logger({
      category: "action",
      message: "scrolling element into view",
      level: 2,
      auxiliary: {
        xpath: {
          value: xpath,
          type: "string",
        },
      },
    });
    try {
      await locator
        .evaluate((element: HTMLElement) => {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        })
        .catch((e: Error) => {
          logger({
            category: "action",
            message: "error scrolling element into view",
            level: 1,
            auxiliary: {
              error: {
                value: e.message,
                type: "string",
              },
              trace: {
                value: e.stack,
                type: "string",
              },
              xpath: {
                value: xpath,
                type: "string",
              },
            },
          });
        });
    } catch (e) {
      logger({
        category: "action",
        message: "error scrolling element into view",
        level: 1,
        auxiliary: {
          error: {
            value: e.message,
            type: "string",
          },
          trace: {
            value: e.stack,
            type: "string",
          },
          xpath: {
            value: xpath,
            type: "string",
          },
        },
      });

      throw new PlaywrightCommandException(e.message);
    }
  } else if (method === "fill" || method === "type") {
    try {
      await locator.fill("");
      await locator.click();
      const text = args[0]?.toString();
      for (const char of text) {
        await stagehandPage.keyboard.type(char, {
          delay: Math.random() * 50 + 25,
        });
      }
    } catch (e) {
      logger({
        category: "action",
        message: "error filling element",
        level: 1,
        auxiliary: {
          error: {
            value: e.message,
            type: "string",
          },
          trace: {
            value: e.stack,
            type: "string",
          },
          xpath: {
            value: xpath,
            type: "string",
          },
        },
      });

      throw new PlaywrightCommandException(e.message);
    }
  } else if (method === "press") {
    try {
      const key = args[0]?.toString();
      await stagehandPage.keyboard.press(key);
    } catch (e) {
      logger({
        category: "action",
        message: "error pressing key",
        level: 1,
        auxiliary: {
          error: {
            value: e.message,
            type: "string",
          },
          trace: {
            value: e.stack,
            type: "string",
          },
          key: {
            value: args[0]?.toString() ?? "unknown",
            type: "string",
          },
        },
      });

      throw new PlaywrightCommandException(e.message);
    }
  } else if (typeof locator[method as keyof typeof locator] === "function") {
    // Log current URL before action
    logger({
      category: "action",
      message: "page URL before action",
      level: 2,
      auxiliary: {
        url: {
          value: stagehandPage.url(),
          type: "string",
        },
      },
    });

    // Perform the action
    try {
      await (
        locator[method as keyof Locator] as unknown as (
          ...args: string[]
        ) => Promise<void>
      )(...args.map((arg) => arg?.toString() || ""));
    } catch (e) {
      logger({
        category: "action",
        message: "error performing method",
        level: 1,
        auxiliary: {
          error: {
            value: e.message,
            type: "string",
          },
          trace: {
            value: e.stack,
            type: "string",
          },
          xpath: {
            value: xpath,
            type: "string",
          },
          method: {
            value: method,
            type: "string",
          },
          args: {
            value: JSON.stringify(args),
            type: "object",
          },
        },
      });

      throw new PlaywrightCommandException(e.message);
    }

    // Handle navigation if a new page is opened
    if (method === "click") {
      logger({
        category: "action",
        message: "clicking element, checking for page navigation",
        level: 1,
        auxiliary: {
          xpath: {
            value: xpath,
            type: "string",
          },
        },
      });

      const newOpenedTab = await Promise.race([
        new Promise<Page | null>((resolve) => {
          Promise.resolve(stagehandPage.context()).then((context) => {
            context.once("page", (page: Page) => resolve(page));
            setTimeout(() => resolve(null), 1_500);
          });
        }),
      ]);

      logger({
        category: "action",
        message: "clicked element",
        level: 1,
        auxiliary: {
          newOpenedTab: {
            value: newOpenedTab ? "opened a new tab" : "no new tabs opened",
            type: "string",
          },
        },
      });

      if (newOpenedTab) {
        logger({
          category: "action",
          message: "new page detected (new tab) with URL",
          level: 1,
          auxiliary: {
            url: {
              value: newOpenedTab.url(),
              type: "string",
            },
          },
        });
        await newOpenedTab.close();
        await stagehandPage.goto(newOpenedTab.url());
        await stagehandPage.waitForLoadState("domcontentloaded");
        // await stagehandPage._waitForSettledDom(domSettleTimeoutMs);
      }

      await Promise.race([
        stagehandPage.waitForLoadState("networkidle"),
        new Promise((resolve) => setTimeout(resolve, 5_000)),
      ]).catch((e) => {
        logger({
          category: "action",
          message: "network idle timeout hit",
          level: 1,
          auxiliary: {
            trace: {
              value: e.stack,
              type: "string",
            },
            message: {
              value: e.message,
              type: "string",
            },
          },
        });
      });

      logger({
        category: "action",
        message: "finished waiting for (possible) page navigation",
        level: 1,
      });

      if (stagehandPage.url() !== initialUrl) {
        logger({
          category: "action",
          message: "new page detected with URL",
          level: 1,
          auxiliary: {
            url: {
              value: stagehandPage.url(),
              type: "string",
            },
          },
        });
      }
    }
  } else {
    logger({
      category: "action",
      message: "chosen method is invalid",
      level: 1,
      auxiliary: {
        method: {
          value: method,
          type: "string",
        },
      },
    });

    throw new PlaywrightCommandMethodNotSupportedException(
      `Method ${method} not supported`,
    );
  }

  // await stagehandPage._waitForSettledDom(domSettleTimeoutMs);
}
