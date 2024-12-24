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
    // Parse URLs to handle different protocols and query parameters
    const currentUrlObj = new URL(currentUrl);
    const patternLower = expectedPattern.toLowerCase();
    const urlLower = currentUrlObj.toString().toLowerCase();

    // Check if pattern exists in the URL, ignoring case
    return urlLower.includes(patternLower);
  } catch {
    // Try simple string matching if URL parsing fails
    return currentUrl.toLowerCase().includes(expectedPattern.toLowerCase());
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
    // Parse URLs to normalize them
    const actualUrl = new URL(actual);
    const expectedUrl = new URL(expected);

    // Compare hostnames and paths, ignoring protocol
    const actualHostPath = `${actualUrl.hostname}${actualUrl.pathname}`.replace(/\/$/, "");
    const expectedHostPath = `${expectedUrl.hostname}${expectedUrl.pathname}`.replace(/\/$/, "");

    return actualHostPath.startsWith(expectedHostPath);
  } catch {
    // Fallback to simple string comparison if URL parsing fails
    const normalizedActual = actual.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const normalizedExpected = expected.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return normalizedActual.startsWith(normalizedExpected);
  }
}
