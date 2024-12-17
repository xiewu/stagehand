/**
 * Utilities for validating URLs in Mind2Web evaluation tasks
 */

/**
 * Checks if a URL includes an expected pattern anywhere in the URL string
 * @param currentUrl The current URL to check
 * @param expectedPattern The pattern that should be included in the URL
 * @returns boolean indicating if the pattern is included
 */
export function validateUrlPath(
  currentUrl: string,
  expectedPattern: string,
): boolean {
  if (!currentUrl || !expectedPattern) {
    return false;
  }

  try {
    // Check if the pattern exists anywhere in the URL
    return currentUrl.toLowerCase().includes(expectedPattern.toLowerCase());
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
