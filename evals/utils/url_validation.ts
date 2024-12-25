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
 * Validates if a URL matches an expected URL pattern based on Mind2Web dataset rules
 * Mind2Web uses url_included_match which checks if the reference_answer is included in the URL
 */
export function validateUrlMatch(actual: string, expected: string): boolean {
  if (!actual || !expected) {
    return false;
  }

  // For Mind2Web dataset, we want to check if the expected pattern is included in the URL
  const normalizedActual = actual.toLowerCase();
  const normalizedExpected = expected.toLowerCase();

  // Handle special cases where expected might be a partial path or domain
  if (normalizedExpected.startsWith("/")) {
    // If expected starts with '/', it's a path pattern
    return normalizedActual.includes(normalizedExpected);
  } else if (normalizedExpected.endsWith(".")) {
    // If expected ends with '.', it's a domain pattern (e.g., 'nfl.')
    const domainPattern = normalizedExpected.slice(0, -1);
    return (
      normalizedActual.includes(`/${domainPattern}.`) ||
      normalizedActual.includes(`//${domainPattern}.`) ||
      normalizedActual.includes(`.${domainPattern}.`)
    );
  } else if (normalizedExpected.endsWith("/")) {
    // If expected ends with '/', it's a path segment (e.g., 'scores/')
    return normalizedActual.includes(normalizedExpected);
  }

  // Default case: simple inclusion check
  return normalizedActual.includes(normalizedExpected);
}
