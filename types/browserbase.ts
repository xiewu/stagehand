import { Browserbase } from "@browserbasehq/sdk";

type BrowserSettings = Browserbase.Sessions.SessionCreateParams["browserSettings"];
type Fingerprint = NonNullable<BrowserSettings>["fingerprint"];

// Runtime-compatible type for browserSettings
export type RuntimeBrowserSettings = {
  blockAds?: boolean;
  context?: BrowserSettings["context"];
  extensionId?: string;
  fingerprint?: Omit<Fingerprint, "httpVersion"> & {
    httpVersion?: "1" | "2";
  };
  logSession?: boolean;
  recordSession?: boolean;
  solveCaptchas?: boolean;
  viewport?: BrowserSettings["viewport"];
};

// Helper function to convert fingerprint settings
function convertFingerprint(fingerprint: Fingerprint | undefined): RuntimeBrowserSettings["fingerprint"] | undefined {
  if (!fingerprint) return undefined;

  const { httpVersion, ...rest } = fingerprint;
  return {
    ...rest,
    ...(httpVersion !== undefined ? { httpVersion: String(httpVersion) as "1" | "2" } : {}),
  };
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
