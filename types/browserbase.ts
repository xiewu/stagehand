import { Browserbase } from "@browserbasehq/sdk";

// SDK types for reference
type SDKFingerprint = Browserbase.Sessions.SessionCreateParams["browserSettings"]["fingerprint"];
type SDKBrowserSettings = Browserbase.Sessions.SessionCreateParams["browserSettings"];

// Runtime types with string httpVersion
export interface RuntimeFingerprint extends Omit<SDKFingerprint, "httpVersion"> {
  httpVersion?: "1" | "2";
}

export interface RuntimeBrowserSettings extends Omit<SDKBrowserSettings, "fingerprint"> {
  fingerprint?: RuntimeFingerprint;
}

// Convert runtime fingerprint to SDK fingerprint - preserve string type for httpVersion
function convertFingerprint(fingerprint?: RuntimeFingerprint): SDKFingerprint | undefined {
  if (!fingerprint) return undefined;

  const { httpVersion, ...rest } = fingerprint;
  return {
    ...rest,
    ...(httpVersion && { httpVersion: httpVersion as unknown as 1 | 2 }),
  };
}

// Convert runtime settings to SDK settings
export function convertToSDKSettings(settings?: RuntimeBrowserSettings): SDKBrowserSettings | undefined {
  if (!settings) return undefined;

  const { fingerprint, ...rest } = settings;
  return {
    ...rest,
    ...(fingerprint && { fingerprint: convertFingerprint(fingerprint) }),
  } as SDKBrowserSettings;
}
