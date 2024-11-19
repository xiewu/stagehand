"use server";

import { Browserbase } from "@browserbasehq/sdk";
import type { SessionCreateResponse } from "@browserbasehq/sdk/resources/index.js";
import {
  Action,
  Extract,
  Observe,
  ObserveResult,
  StagehandAction,
} from "./stagehandActions";

const BACKEND_URL = process.env.BACKEND_URL! || "http://localhost:6969";

export async function createSession(creds: {
  apiKey?: string;
  projectId?: string;
  openaiApiKey?: string;
}): Promise<SessionCreateResponse> {
  const { apiKey, projectId, openaiApiKey } = creds;
  console.log("creds", creds);
  if (openaiApiKey) {
    await fetch(`${BACKEND_URL}/addApiKey`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ apiKey: openaiApiKey }),
    });
  }
  const response = await fetch(`${BACKEND_URL}/`);
  const data = await response.json();
  if (!data.success) {
    throw new Error(
      "Backend health check failed, likely due to an invalid OPENAI_API_KEY",
    );
  }
  console.log("backend health check passed", data);
  if (!apiKey || !projectId) {
    console.log("BROWSERBASE_API_KEY", apiKey);
    console.log("BROWSERBASE_PROJECT_ID", projectId);
    throw new Error(
      "BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID must be set",
    );
  }
  const bb = new Browserbase({
    apiKey,
  });
  const session = await bb.sessions.create({
    projectId,
  });
  return session;
}

export async function getDebugUrl(
  sessionId: string,
  apiKey: string,
): Promise<string> {
  const bb = new Browserbase({
    apiKey,
  });
  const debugUrl = await bb.sessions.debug(sessionId);
  return debugUrl.debuggerUrl;
}

async function navigate(
  url: string,
  sessionId: string,
  apiKey: string,
  projectId: string,
  requestId: string,
) {
  await fetch(`${BACKEND_URL}/goto`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requestId, url, sessionId, apiKey, projectId }),
  });
}

async function act(
  action: Action,
  sessionId: string,
  apiKey: string,
  projectId: string,
) {
  const result = await fetch(`${BACKEND_URL}/act`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...action, sessionId, apiKey, projectId }),
  });
  return result.json();
}

async function observe(
  observe: Observe,
  sessionId: string,
  apiKey: string,
  projectId: string,
) {
  const result = await fetch(`${BACKEND_URL}/observe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...observe, sessionId, apiKey, projectId }),
  });
  const resultJson: { description: string; selector: string }[] =
    await result.json();
  console.log("observe result", resultJson);
  return resultJson;
}

async function extract(
  action: Extract,
  sessionId: string,
  apiKey: string,
  projectId: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${BACKEND_URL}/extract`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sessionId,
      instruction: action.instruction,
      modelName: action.modelName,
      schema: action.schema,
      apiKey,
      projectId,
    }),
  });

  const data = await response.json();
  return data;
}

export async function executeAction(
  action: StagehandAction,
  sessionId: string,
  skipObserve: boolean = true,
  apiKey: string,
  projectId: string,
): Promise<ObserveResult[] | Record<string, unknown>> {
  if (action.actionType === "action") {
    await act(action, sessionId, apiKey, projectId);
  } else if (action.actionType === "extract") {
    return await extract(action, sessionId, apiKey, projectId);
  } else if (action.actionType === "navigate") {
    await navigate(action.url, sessionId, apiKey, projectId, action.requestId);
  } else if (action.actionType === "observe") {
    const observations = await observe(action, sessionId, apiKey, projectId);
    return observations;
  }
  if (!skipObserve) {
    const observations = await observe(
      {
        requestId: action.requestId,
        actionType: "observe",
        instruction:
          "Observe the 3-5 most likely things a user would do on this page. Describe the observation as 'click...', 'hover...', 'type...', etc.",
      },
      sessionId,
      apiKey,
      projectId,
    );
    return observations;
  }
  return [];
}
