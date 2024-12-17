/**
 * Utilities for validating URLs in Mind2Web evaluation tasks
 */

/**
 * Checks if a URL's pathname includes an expected path segment
 * @param currentUrl The current URL to check
 * @param expectedPath The path segment that should be included
 * @returns boolean indicating if the path segment is included
 */
export function validateUrlPath(
  currentUrl: string,
  expectedPath: string,
): boolean {
  if (!currentUrl || !expectedPath) {
    return false;
  }

  try {
    const url = new URL(currentUrl);
    return url.pathname.includes(expectedPath);
  } catch {
    // Return false for invalid URLs
    return false;
  }
}

/**
 * Checks if a URL starts with an expected URL prefix
 * @param actual The actual URL to check
 * @param expected The expected URL prefix
 * @returns boolean indicating if the actual URL starts with the expected prefix
 */
export function validateUrlMatch(actual: string, expected: string): boolean {
  if (!actual || !expected) {
    return false;
  }

  try {
    // Normalize URLs by removing trailing slashes
    const normalizedActual = actual.replace(/\/$/, "");
    const normalizedExpected = expected.replace(/\/$/, "");
    return normalizedActual.startsWith(normalizedExpected);
  } catch {
    return false;
  }
}
