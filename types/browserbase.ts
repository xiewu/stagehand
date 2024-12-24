import { Browserbase } from "@browserbasehq/sdk";

// Override SDK's type to match runtime requirements
type BrowserbaseFingerprint = Omit<Browserbase.Sessions.SessionCreateParams["browserSettings"]["fingerprint"], "httpVersion"> & {
  httpVersion?: "1" | "2";
};

type BrowserSettings = Omit<Browserbase.Sessions.SessionCreateParams["browserSettings"], "fingerprint"> & {
  fingerprint?: BrowserbaseFingerprint;
};

// Runtime-compatible type for browserSettings
export type RuntimeBrowserSettings = BrowserSettings;

// Helper function to convert fingerprint settings
function convertFingerprint(fingerprint: BrowserbaseFingerprint | undefined): RuntimeBrowserSettings["fingerprint"] | undefined {
  if (!fingerprint) return undefined;
  return fingerprint;
}

// Type guard to ensure runtime compatibility
export function ensureRuntimeCompatibleSettings(
  settings: BrowserSettings | undefined,
): RuntimeBrowserSettings {
  if (!settings) return {};

  const {
    blockAds,
    context,
    extensionId,
    fingerprint,
    logSession,
    recordSession,
    solveCaptchas,
    viewport,
  } = settings;

  return {
    ...(blockAds !== undefined && { blockAds }),
    ...(context !== undefined && { context }),
    ...(extensionId !== undefined && { extensionId }),
    ...(fingerprint !== undefined && { fingerprint: convertFingerprint(fingerprint) }),
    ...(logSession !== undefined && { logSession }),
    ...(recordSession !== undefined && { recordSession }),
    ...(solveCaptchas !== undefined && { solveCaptchas }),
    ...(viewport !== undefined && { viewport }),
  };
}
