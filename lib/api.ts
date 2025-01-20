import {
  ExecuteActionParams,
  StagehandAPIConstructorParams,
  StartSessionParams,
  StartSessionResult,
} from "../types/api";
import {
  ActOptions,
  ActResult,
  ExtractOptions,
  ExtractResult,
  ObserveOptions,
  ObserveResult,
} from "../types/stagehand";
import { LogLine } from "../types/log";
import { z } from "zod";
import { GotoOptions } from "../types/playwright";
import zodToJsonSchema from "zod-to-json-schema";

const API_URL = "http://localhost:3001/api";

export class StagehandAPI {
  private apiKey: string;
  private projectId: string;
  private sessionId?: string;
  private logger: (message: LogLine) => void;

  constructor({ apiKey, projectId, logger }: StagehandAPIConstructorParams) {
    this.apiKey = apiKey;
    this.projectId = projectId;
    this.logger = logger;
  }

  async init({
    modelName,
    modelApiKey,
    domSettleTimeoutMs,
    verbose,
    debugDom,
  }: StartSessionParams): Promise<StartSessionResult> {
    const whitelistResponse = await this.request("/verify-whitelist", {
      method: "POST",
    });

    if (whitelistResponse.status === 400) {
      throw new Error(
        "API Key empty or missing from request headers. Ensure it has been provided.",
      );
    } else if (whitelistResponse.status === 401) {
      throw new Error(
        "API Key not whitelisted, ensure you have added your API key to the whitelist.",
      );
    } else if (whitelistResponse.status !== 200) {
      throw new Error(`Unknown error: ${whitelistResponse.status}`);
    }

    const sessionResponse = await this.request("/start-session", {
      method: "POST",
      body: JSON.stringify({
        modelName,
        domSettleTimeoutMs,
        verbose,
        debugDom,
      }),
      headers: {
        "model-api-key": modelApiKey,
      },
    });

    if (sessionResponse.status !== 200) {
      throw new Error(`Unknown error: ${sessionResponse.status}`);
    }

    const sessionResponseBody =
      (await sessionResponse.json()) as StartSessionResult;
    this.sessionId = sessionResponseBody.sessionId;

    return sessionResponseBody;
  }

  async act(options: ActOptions): Promise<ActResult> {
    return this.execute<ActResult>({
      method: "act",
      args: { ...options },
    });
  }

  async extract<T extends z.AnyZodObject>(
    options: ExtractOptions<T>,
  ): Promise<ExtractResult<T>> {
    const parsedSchema = zodToJsonSchema(options.schema);
    return this.execute<ExtractResult<T>>({
      method: "extract",
      args: { ...options, schemaDefinition: parsedSchema },
    });
  }

  async observe(options?: ObserveOptions): Promise<ObserveResult[]> {
    return this.execute<ObserveResult[]>({
      method: "observe",
      args: { ...options },
    });
  }

  async goto(url: string, options?: GotoOptions): Promise<void> {
    return this.execute<void>({
      method: "navigate",
      args: { url, options },
    });
  }

  private async execute<T>({ method, args }: ExecuteActionParams): Promise<T> {
    const response = await this.request(`/${method}`, {
      method: "POST",
      body: JSON.stringify(args),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `HTTP error! status: ${response.status}, body: ${errorBody}`,
      );
    }

    if (!response.body) {
      throw new Error("Response body is null");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        // Process any remaining data before breaking
        if (buffer) {
          const lines = buffer.split("\n\n");
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const eventData = JSON.parse(line.slice(6));
              if (eventData.type === "system") {
                if (eventData.data.status === "error") {
                  throw new Error(eventData.data.error);
                }
                if (eventData.data.status === "finished") {
                  return eventData.data.result as T;
                }
              } else if (eventData.type === "log") {
                console.log(eventData.data.message);
              }
            } catch (e) {
              console.error("Error parsing event data:", e);
              throw new Error("Failed to parse server response");
            }
          }
        }
        throw new Error("Stream ended without receiving finished event");
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const eventData = JSON.parse(line.slice(6));
          if (eventData.type === "system") {
            if (eventData.data.status === "error") {
              throw new Error(eventData.data.error);
            }
            if (eventData.data.status === "finished") {
              return eventData.data.result as T;
            }
          } else if (eventData.type === "log") {
            this.logger(eventData.data.message);
          }
        } catch (e) {
          console.error("Error parsing event data:", e);
          throw new Error("Failed to parse server response");
        }
      }
    }
  }

  private async request(
    path: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const defaultHeaders = {
      "browserbase-api-key": this.apiKey,
      "browserbase-project-id": this.projectId,
      "browserbase-session-id": this.sessionId,
      "Content-Type": "application/json",
    };

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    });

    return response;
  }
}
