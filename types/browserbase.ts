import { Browserbase } from "@browserbasehq/sdk";

// SDK types for reference
type SDKFingerprint = Browserbase.Sessions.SessionCreateParams["browserSettings"]["fingerprint"];
type SDKBrowserSettings = Browserbase.Sessions.SessionCreateParams["browserSettings"];

// Runtime types with string httpVersion
export interface RuntimeFingerprint extends Omit<SDKFingerprint, "httpVersion"> {
  httpVersion?: 1 | 2;  // Changed to match SDK type
}

export interface RuntimeBrowserSettings extends Omit<SDKBrowserSettings, "fingerprint"> {
  fingerprint?: RuntimeFingerprint;
}

// Convert runtime fingerprint to SDK fingerprint
function convertFingerprint(fingerprint?: RuntimeFingerprint): SDKFingerprint | undefined {
  if (!fingerprint) return undefined;
  return fingerprint;  // No conversion needed since types match
}

// Convert runtime settings to SDK settings
export function convertToSDKSettings(settings?: RuntimeBrowserSettings): SDKBrowserSettings | undefined {
  if (!settings) return undefined;
  return settings as SDKBrowserSettings;  // Types are now compatible
}
