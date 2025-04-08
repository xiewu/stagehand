import { AccessibilityNode } from "../../types/context";

/**
 * In our text‐formatting logic for the accessibility tree, any node whose role
 * is contained in this set (or whose comma‐separated roles include one of these)
 * is treated as a “block‐level” container. That means it:
 *
 * 1) Appears as its own structural block in the final text output (e.g., a paragraph or heading).
 * 2) Usually starts on a new line and may contain nested inline content or further blocks.
 * 3) Receives indentation in our hierarchy, reflecting the parent–child structure.
 *
 * Common examples of block‐level roles are:
 * - "paragraph": Printed as a separate text block/section
 * - "heading": Represented on its own line, possibly with extra emphasis
 * - "list" and "listitem": Each item is shown on a new line
 * - "div": Used as a generic container to encapsulate other content
 *
 * Nodes that are *not* in this set (e.g., "StaticText" or simple "link")
 * are considered “inline” and have their text merged into the nearest block’s text flow,
 * rather than forming their own block in the output.
 */
export const BLOCK_LEVEL_ROLES = new Set([
  "paragraph",
  "heading",
  "list",
  "listitem",
  "div",
  "checkbox",
  "combobox",
  "option",
]);

/**
 * The maximum character width per line when wrapping text segments.
 */
export const MAX_LINE_WIDTH = 100;

/**
 * Determines if a node is "block-level".
 *
 * @param node - The accessibility node to evaluate.
 * @returns true if the node's role matches or includes a block-level role.
 */
export function isBlockLevel(node: AccessibilityNode): boolean {
  const parts = node.role
    .toLowerCase()
    .split(",")
    .map((r) => r.trim());
  return parts.some((p) => BLOCK_LEVEL_ROLES.has(p));
}

/**
 * Determines if a node is an "inline leaf," meaning it:
 * 1) Is NOT block-level itself, and
 * 2) Has no children, or only children that are also inline leaves
 *    (i.e., no block-level descendants).
 *
 * @param node - The accessibility node to check.
 * @returns true if the node can be treated as inline-only with no block substructure.
 */
export function isInlineLeaf(node: AccessibilityNode): boolean {
  if (isBlockLevel(node)) return false;

  if (!node.children || node.children.length === 0) {
    return true; // no children => definitely a leaf
  }
  for (const child of node.children) {
    if (isBlockLevel(child)) {
      return false; // if any child is block-level, this node isn't purely inline
    }
    if (child.children && child.children.length > 0) {
      return false; // any grand-children => not a simple leaf
    }
  }
  return true;
}

/**
 * Collects text for a node that has been deemed an "inline leaf."
 *
 * How it works:
 * - If the node is StaticText, we split its .name into individual words/tokens.
 * - If the node is a link, we produce an inline reference like ["[@123]", "some", "text"]
 *   so we can show "[@123] some text" inline.
 * - If the node has children but is still considered an inline leaf overall,
 *   we gather text from each child, concatenating everything into a single array of tokens.
 *
 * @param node - The node to gather text from.
 * @returns An array of string tokens representing the node’s text content.
 */
export function gatherInlineLeafText(node: AccessibilityNode): string[] {
  // 1) Handle StaticText directly
  if (node.role === "StaticText") {
    const text = (node.name || "").trim();
    return text ? text.split(/\s+/) : [];
  }

  // 2) If it's a link (including comma‐separated roles like "scrollable, link"),
  //    produce an inline reference and the link text as separate tokens.
  const parts = node.role.split(",").map((r) => r.trim());
  if (parts.includes("link")) {
    const linkText = (node.name || "").trim();
    if (linkText) {
      return [`[@${node.nodeId}]`, ...linkText.split(/\s+/)];
    }
    return [`[@${node.nodeId}]`];
  }

  // 3) Otherwise, if it’s some container that is still considered an inline leaf,
  //    we gather text from its children (recursively).
  const result: string[] = [];
  if (node.children) {
    for (const child of node.children) {
      if (isInlineLeaf(child)) {
        result.push(...gatherInlineLeafText(child));
      }
    }
  }
  return result;
}

/**
 * Splits an array of words or tokens into wrapped lines, ensuring
 * lines do not exceed `maxWidth` characters. Each line is prefixed
 * with the given `indent` string (for hierarchical display).
 *
 * @param segments - Array of individual text tokens.
 * @param indent - A string (e.g., "  ") prepended to each line.
 * @param maxWidth - Maximum line length (including indentation).
 * @returns A multi-line string with the tokens wrapped,
 *          ensuring lines don't exceed `maxWidth` characters.
 */
export function wrapTextSegments(
  segments: string[],
  indent: string,
  maxWidth: number = MAX_LINE_WIDTH,
): string {
  const lines: string[] = [];
  let currentLine = indent;

  for (const seg of segments) {
    // +1 for a space between existing content and the new segment.
    if (currentLine.length + seg.length + 1 > maxWidth) {
      lines.push(currentLine);
      currentLine = indent + seg;
    } else {
      if (currentLine === indent) {
        currentLine += seg; // first token on the line
      } else {
        currentLine += " " + seg;
      }
    }
  }

  if (currentLine.trim() !== "") {
    lines.push(currentLine);
  }

  return lines.join("\n");
}

/**
 * Formats an accessibility tree for display, producing a simplified
 * multi-line string representation.
 *
 * How it works:
 * 1) Print a line describing the current node, e.g. "[nodeId] role(: name?)"
 * 2) Collect inline-leaf children’s text in a local buffer (inlineBuffer).
 *    - If we encounter a block-level child, we first flush the inlineBuffer
 *      by word-wrapping it beneath the current node's line.
 *    - Then we recursively format the block-level child, increasing indentation.
 * 3) After processing all children, if the inlineBuffer is still non-empty,
 *    we do one final flush, appending the wrapped text to the output.
 *
 * This approach preserves the node hierarchy (by indentation)
 * and avoids duplicating text from inline children.
 *
 * @param node - The root or subnode to format.
 * @param level - The current indentation level (defaults to 0).
 * @returns A string with line-breaks reflecting the node hierarchy and wrapped text.
 */
export function formatSimplifiedTree(
  node: AccessibilityNode,
  level = 0,
): string {
  const indent = "  ".repeat(level);

  // Print a line for the current node
  let output = `${indent}[${node.nodeId}] ${node.role}`;
  if (node.name) output += `: ${node.name}`;
  output += "\n";

  // Buffer for collecting inline text from consecutive inline-leaf children
  let inlineBuffer: string[] = [];

  if (node.children) {
    for (const child of node.children) {
      // If child is purely inline, gather its text
      if (isInlineLeaf(child)) {
        inlineBuffer.push(...gatherInlineLeafText(child));
      } else {
        // This child is a block-level or container node => flush inline text first
        if (inlineBuffer.length > 0) {
          const wrapped = wrapTextSegments(
            inlineBuffer,
            indent + "  ",
            MAX_LINE_WIDTH,
          );
          output += wrapped + "\n";
          inlineBuffer = [];
        }
        // Then format this block-level child recursively, increasing indentation
        output += formatSimplifiedTree(child, level + 1);
      }
    }
  }

  // If there's leftover inline text at the end, flush it
  if (inlineBuffer.length > 0) {
    const wrapped = wrapTextSegments(
      inlineBuffer,
      indent + "  ",
      MAX_LINE_WIDTH,
    );
    output += wrapped + "\n";
  }

  return output;
}
