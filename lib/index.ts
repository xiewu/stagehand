import { chromium, Browser, BrowserContext, Page } from "playwright";
import { Browserbase } from "@browserbasehq/sdk";
import { randomUUID } from "crypto";
import dotenv from "dotenv";
import fs from "fs";
import os from "os";
import path from "path";
import { z } from "zod";
import { BrowserResult } from "../types/browser";
import { LogLine } from "../types/log";
import { GotoOptions } from "../types/playwright";
import {
  ActOptions,
  ActResult,
  ConstructorParams,
  ExtractOptions,
  ExtractResult,
  InitFromPageOptions,
  InitFromPageResult,
  InitOptions,
  InitResult,
  ObserveOptions,
  ObserveResult,
} from "../types/stagehand";
import { scriptContent } from "./dom/build/scriptContent";
import { StagehandActHandler } from "./handlers/actHandler";
import { StagehandExtractHandler } from "./handlers/extractHandler";
import { StagehandObserveHandler } from "./handlers/observeHandler";
import { LLMClient } from "./llm/LLMClient";
import { LLMProvider } from "./llm/LLMProvider";
import { logLineToString } from "./utils";
import { convertToSDKSettings, RuntimeBrowserSettings } from "../types/browserbase";
import { AvailableModelSchema } from "../types/model";

dotenv.config({ path: ".env" });

const DEFAULT_MODEL_NAME = "gpt-4o" as const;
const BROWSERBASE_REGION_DOMAIN = {
  "us-west-2": "wss://connect.usw2.browserbase.com",
  "us-east-1": "wss://connect.use1.browserbase.com",
  "eu-central-1": "wss://connect.euc1.browserbase.com",
  "ap-southeast-1": "wss://connect.apse1.browserbase.com",
};

async function getBrowser(
  env: "LOCAL" | "BROWSERBASE",
  apiKey: string | undefined,
  logger: (message: LogLine) => void,
  browserbaseSessionCreateParams?: Omit<Browserbase.Sessions.SessionCreateParams, "browserSettings"> & {
    browserSettings?: RuntimeBrowserSettings;
  },
  browserbaseResumeSessionID?: string,
  headless: boolean = false,
): Promise<BrowserResult> {
  let sessionId: string | undefined;
  let connectUrl: string | undefined;
  let debugUrl: string | undefined;
  let sessionUrl: string | undefined;
  let contextPath: string | undefined;
  let browser: Browser;

  if (env === "BROWSERBASE") {
    if (!apiKey) {
      logger({
        category: "init",
        message: "browserbase api key not found",
        level: 2,
      });
      throw new Error("Browserbase API key not found");
    }

    const browserbase = new Browserbase({ apiKey });

    if (browserbaseResumeSessionID) {
      // Validate the session status
      try {
        const sessionStatus = await browserbase.sessions.retrieve(
          browserbaseResumeSessionID,
        );

        if (sessionStatus.status !== "RUNNING") {
          throw new Error(
            `Session ${browserbaseResumeSessionID} is not running (status: ${sessionStatus.status})`,
          );
        }

        sessionId = browserbaseResumeSessionID;
        const browserbaseDomain =
          BROWSERBASE_REGION_DOMAIN[sessionStatus.region] ||
          "wss://connect.browserbase.com";
        connectUrl = `${browserbaseDomain}?apiKey=${apiKey}&sessionId=${sessionId}`;

        logger({
          category: "init",
          message: "resuming existing browserbase session...",
          level: 1,
          auxiliary: {
            sessionId: {
              value: sessionId,
              type: "string",
            },
          },
        });
      } catch (error) {
        logger({
          category: "init",
          message: "failed to resume session",
          level: 1,
          auxiliary: {
            error: {
              value: error.message,
              type: "string",
            },
            trace: {
              value: error.stack,
              type: "string",
            },
          },
        });
        throw error;
      }
    } else {
      // Create new session (existing code)
      logger({
        category: "init",
        message: "creating new browserbase session...",
        level: 0,
      });

      if (!browserbaseSessionCreateParams) {
        throw new Error(
          "browserbaseSessionCreateParams is required for new Browserbase sessions.",
        );
      }

      const session = await browserbase.sessions.create({
        ...browserbaseSessionCreateParams,
        browserSettings: browserbaseSessionCreateParams?.browserSettings
          ? convertToSDKSettings(browserbaseSessionCreateParams.browserSettings)
          : undefined,
      });

      sessionId = session.id;
      connectUrl = session.connectUrl;
      logger({
        category: "init",
        message: "created new browserbase session",
        level: 1,
        auxiliary: {
          sessionId: {
            value: sessionId,
            type: "string",
          },
        },
      });
    }

    browser = await chromium.connectOverCDP(connectUrl);
    const { debuggerUrl } = await browserbase.sessions.debug(sessionId);

    debugUrl = debuggerUrl;
    sessionUrl = `https://www.browserbase.com/sessions/${sessionId}`;

    logger({
      category: "init",
      message: browserbaseResumeSessionID
        ? "browserbase session resumed"
        : "browserbase session started",
      level: 0,
      auxiliary: {
        sessionUrl: {
          value: sessionUrl,
          type: "string",
        },
        debugUrl: {
          value: debugUrl,
          type: "string",
        },
        sessionId: {
          value: sessionId,
          type: "string",
        },
      },
    });

    const context = browser.contexts()[0];

    return { browser, context, debugUrl, sessionUrl, sessionId };
  } else {
    logger({
      category: "init",
      message: "launching local browser",
      level: 0,
      auxiliary: {
        headless: {
          value: headless.toString(),
          type: "boolean",
        },
      },
    });

    const tmpDirPath = path.join(os.tmpdir(), "stagehand");
    if (!fs.existsSync(tmpDirPath)) {
      fs.mkdirSync(tmpDirPath, { recursive: true });
    }

    const tmpDir = fs.mkdtempSync(path.join(tmpDirPath, "ctx_"));
    fs.mkdirSync(path.join(tmpDir, "userdir/Default"), { recursive: true });

    const defaultPreferences = {
      plugins: {
        always_open_pdf_externally: true,
      },
    };

    fs.writeFileSync(
      path.join(tmpDir, "userdir/Default/Preferences"),
      JSON.stringify(defaultPreferences),
    );

    const downloadsPath = path.join(process.cwd(), "downloads");
    fs.mkdirSync(downloadsPath, { recursive: true });

    const context = await chromium.launchPersistentContext(
      path.join(tmpDir, "userdir"),
      {
        acceptDownloads: true,
        headless: headless,
        viewport: {
          width: 1250,
          height: 800,
        },
        locale: "en-US",
        timezoneId: "America/New_York",
        deviceScaleFactor: 1,
        args: [
          "--enable-webgl",
          "--use-gl=swiftshader",
          "--enable-accelerated-2d-canvas",
          "--disable-blink-features=AutomationControlled",
          "--disable-web-security",
        ],
        bypassCSP: true,
      },
    );

    logger({
      category: "init",
      message: "local browser started successfully.",
    });

    await applyStealthScripts(context);

    return { context, contextPath: tmpDir };
  }
}

async function applyStealthScripts(context: BrowserContext) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });

    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });

    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });

    delete (window as any).__playwright;
    delete (window as any).__pw_manual;
    delete (window as any).__PW_inspect;

    Object.defineProperty(navigator, "headless", {
      get: () => false,
    });

    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters: any) =>
      parameters.name === "notifications"
        ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
        : originalQuery(parameters);
  });
}

export class Stagehand {
  private llmProvider: LLMProvider;
  private llmClient: LLMClient;
  public page: Page | undefined;
  public context!: BrowserContext;
  public browserbaseSessionID?: string;
  private contextPath?: string;

  private env: "LOCAL" | "BROWSERBASE";
  private apiKey: string | undefined;
  private verbose: 0 | 1 | 2;
  private debugDom: boolean;
  private headless: boolean;
  private logger: (logLine: LogLine) => void;
  private externalLogger?: (logLine: LogLine) => void;
  private domSettleTimeoutMs: number;
  private browserbaseSessionCreateParams?: Omit<Browserbase.Sessions.SessionCreateParams, "browserSettings"> & {
    browserSettings?: RuntimeBrowserSettings;
  };
  private enableCaching: boolean;
  private variables: { [key: string]: unknown } = {};
  private browserbaseResumeSessionID?: string;

  private actHandler?: StagehandActHandler;
  private extractHandler?: StagehandExtractHandler;
  private observeHandler?: StagehandObserveHandler;

  constructor({
    env = "LOCAL",
    apiKey,
    verbose = 0,
    debugDom = false,
    llmProvider,
    headless = false,
    logger = console.log,
    browserbaseSessionCreateParams,
    domSettleTimeoutMs = 30_000,
    enableCaching = true,
    browserbaseResumeSessionID,
    modelName = DEFAULT_MODEL_NAME,
    modelClientOptions,
  }: {
    env?: "LOCAL" | "BROWSERBASE";
    apiKey?: string;
    verbose?: 0 | 1 | 2;
    debugDom?: boolean;
    llmProvider?: LLMProvider;
    headless?: boolean;
    logger?: (logLine: LogLine) => void;
    browserbaseSessionCreateParams?: Omit<Browserbase.Sessions.SessionCreateParams, "browserSettings"> & {
      browserSettings?: RuntimeBrowserSettings;
    };
    browserbaseResumeSessionID?: string;
    domSettleTimeoutMs?: number;
    enableCaching?: boolean;
    modelName?: z.infer<typeof AvailableModelSchema>;
    modelClientOptions?: any;
  } = {}) {
    this.externalLogger = logger;
    this.logger = this.log.bind(this);
    this.enableCaching = enableCaching ?? (process.env.ENABLE_CACHING === "true");
    this.llmProvider = llmProvider || new LLMProvider(this.logger, this.enableCaching);
    this.env = env;
    this.apiKey = apiKey ?? process.env.BROWSERBASE_API_KEY;
    this.verbose = verbose ?? 0;
    this.debugDom = debugDom ?? false;
    this.llmClient = this.llmProvider.getClient(modelName, modelClientOptions);
    this.domSettleTimeoutMs = domSettleTimeoutMs ?? 30_000;
    this.headless = headless ?? false;
    this.browserbaseSessionCreateParams = browserbaseSessionCreateParams;
    this.browserbaseResumeSessionID = browserbaseResumeSessionID;
  }

  async init(
    /** @deprecated Use constructor options instead */
    initOptions?: InitOptions,
  ): Promise<InitResult> {
    if (initOptions) {
      console.warn(
        "Passing parameters to init() is deprecated and will be removed in the next major version. Use constructor options instead.",
      );
    }
    const { context, debugUrl, sessionUrl, contextPath, sessionId } = await getBrowser(
      this.env,
      this.apiKey,
      this.logger,
      this.browserbaseSessionCreateParams,
      this.browserbaseResumeSessionID,
      this.headless,
    );

    if (!context) {
      throw new Error("Failed to initialize browser context.");
    }

    this.contextPath = contextPath;
    this.context = context;
    this.page = context.pages()[0];
    // Redundant but needed for users who are re-connecting to a previously-created session
    await this.page.waitForLoadState("domcontentloaded");
    await this._waitForSettledDom();

    // Overload the page.goto method
    const originalGoto = this.page.goto.bind(this.page);
    this.page.goto = async (url: string, options: GotoOptions) => {
      const result = await originalGoto(url, options);
      if (this.debugDom) {
        await this.page.evaluate(() => (window.showChunks = this.debugDom));
      }
      await this.page.waitForLoadState("domcontentloaded");
      await this._waitForSettledDom();
      return result;
    };

    // Set the browser to headless mode if specified
    if (this.headless) {
      await this.page.setViewportSize({ width: 1280, height: 720 });
    }

    await this.context.addInitScript({
      content: scriptContent,
    });

    this.actHandler = new StagehandActHandler({
      stagehand: this,
      verbose: this.verbose,
      llmProvider: this.llmProvider,
      enableCaching: this.enableCaching,
      logger: this.logger,
      waitForSettledDom: this._waitForSettledDom.bind(this),
      startDomDebug: this.startDomDebug.bind(this),
      cleanupDomDebug: this.cleanupDomDebug.bind(this),
      llmClient: this.llmClient,
    });

    this.extractHandler = new StagehandExtractHandler({
      stagehand: this,
      logger: this.logger,
      waitForSettledDom: this._waitForSettledDom.bind(this),
      startDomDebug: this.startDomDebug.bind(this),
      cleanupDomDebug: this.cleanupDomDebug.bind(this),
      llmProvider: this.llmProvider,
      verbose: this.verbose,
      llmClient: this.llmClient,
    });

    this.observeHandler = new StagehandObserveHandler({
      stagehand: this,
      logger: this.logger,
      waitForSettledDom: this._waitForSettledDom.bind(this),
      startDomDebug: this.startDomDebug.bind(this),
      cleanupDomDebug: this.cleanupDomDebug.bind(this),
      llmProvider: this.llmProvider,
      verbose: this.verbose,
      llmClient: this.llmClient,
    });
    this.browserbaseSessionID = sessionId;

    return { debugUrl, sessionUrl, sessionId };
  }

  /** @deprecated initFromPage is deprecated and will be removed in the next major version. */
  async initFromPage({
    page,
  }: InitFromPageOptions): Promise<InitFromPageResult> {
    console.warn(
      "initFromPage is deprecated and will be removed in the next major version. To instantiate from a page, use `browserbaseResumeSessionID` in the constructor.",
    );
    this.page = page;
    this.context = page.context();

    const originalGoto = this.page.goto.bind(this.page);
    this.page.goto = async (url: string, options?: GotoOptions) => {
      const result = await originalGoto(url, options);
      if (this.debugDom) {
        await this.page.evaluate(() => (window.showChunks = this.debugDom));
      }
      await this.page.waitForLoadState("domcontentloaded");
      await this._waitForSettledDom();
      return result;
    };

    // Set the browser to headless mode if specified
    if (this.headless) {
      await this.page.setViewportSize({ width: 1280, height: 720 });
    }

    // Add initialization scripts
    await this.context.addInitScript({
      content: scriptContent,
    });

    return { context: this.context };
  }

  private pending_logs_to_send_to_browserbase: LogLine[] = [];

  private is_processing_browserbase_logs: boolean = false;

  log(logObj: LogLine): void {
    logObj.level = logObj.level || 1;

    // Normal Logging
    if (this.externalLogger) {
      this.externalLogger(logObj);
    } else {
      const logMessage = logLineToString(logObj);
      console.log(logMessage);
    }

    // Add the logs to the browserbase session
    this.pending_logs_to_send_to_browserbase.push({
      ...logObj,
      id: randomUUID(),
    });
    this._run_browserbase_log_processing_cycle();
  }

  private async _run_browserbase_log_processing_cycle() {
    if (this.is_processing_browserbase_logs) {
      return;
    }
    this.is_processing_browserbase_logs = true;
    const pending_logs = [...this.pending_logs_to_send_to_browserbase];
    for (const logObj of pending_logs) {
      await this._log_to_browserbase(logObj);
    }
    this.is_processing_browserbase_logs = false;
  }

  private async _log_to_browserbase(logObj: LogLine) {
    logObj.level = logObj.level || 1;

    if (!this.page) {
      return;
    }

    if (this.verbose >= logObj.level) {
      await this.page
        .evaluate((logObj) => {
          const logMessage = logLineToString(logObj);
          if (
            logObj.message.toLowerCase().includes("trace") ||
            logObj.message.toLowerCase().includes("error:")
          ) {
            console.error(logMessage);
          } else {
            console.log(logMessage);
          }
        }, logObj)
        .then(() => {
          this.pending_logs_to_send_to_browserbase =
            this.pending_logs_to_send_to_browserbase.filter(
              (log) => log.id !== logObj.id,
            );
        })
        .catch(() => {
          // NAVIDTODO: Rerun the log call on the new page
          // This is expected to happen when the user is changing pages
          // console.error("Logging Error:", e);
          // this.log({
          //   category: "browserbase",
          //   message: "error logging to browserbase",
          //   level: 1,
          //   auxiliary: {
          //     trace: {
          //       value: e.stack,
          //       type: "string",
          //     },
          //     message: {
          //       value: e.message,
          //       type: "string",
          //     },
          //   },
          // });
        });
    }
  }

  private async _waitForSettledDom(timeoutMs?: number) {
    try {
      const timeout = timeoutMs ?? this.domSettleTimeoutMs;
      let timeoutHandle: NodeJS.Timeout;

      const timeoutPromise = new Promise<void>((resolve) => {
        timeoutHandle = setTimeout(() => {
          this.log({
            category: "dom",
            message: "DOM settle timeout exceeded, continuing anyway",
            level: 1,
            auxiliary: {
              timeout_ms: {
                value: timeout.toString(),
                type: "integer",
              },
            },
          });
          resolve();
        }, timeout);
      });

      try {
        await Promise.race([
          this.page.evaluate(() => {
            return new Promise<void>((resolve) => {
              if (typeof window.waitForDomSettle === "function") {
                window.waitForDomSettle().then(resolve);
              } else {
                console.warn(
                  "waitForDomSettle is not defined, considering DOM as settled",
                );
                resolve();
              }
            });
          }),
          this.page.waitForLoadState("domcontentloaded"),
          this.page.waitForSelector("body"),
          timeoutPromise,
        ]);
      } finally {
        clearTimeout(timeoutHandle!);
      }
    } catch (e) {
      this.log({
        category: "dom",
        message: "Error in waitForSettledDom",
        level: 1,
        auxiliary: {
          error: {
            value: e.message,
            type: "string",
          },
          trace: {
            value: e.stack,
            type: "string",
          },
        },
      });
    }
  }

  private async startDomDebug() {
    try {
      await this.page
        .evaluate(() => {
          if (typeof window.debugDom === "function") {
            window.debugDom();
          } else {
            this.log({
              category: "dom",
              message: "debugDom is not defined",
              level: 1,
            });
          }
        })
        .catch(() => {});
    } catch (e) {
      this.log({
        category: "dom",
        message: "Error in startDomDebug",
        level: 1,
        auxiliary: {
          error: {
            value: e.message,
            type: "string",
          },
          trace: {
            value: e.stack,
            type: "string",
          },
        },
      });
    }
  }

  private async cleanupDomDebug() {
    if (this.debugDom) {
      await this.page.evaluate(() => window.cleanupDebug()).catch(() => {});
    }
  }

  async act({
    action,
    modelName,
    modelClientOptions,
    useVision = "fallback",
    variables = {},
    domSettleTimeoutMs,
  }: ActOptions): Promise<ActResult> {
    if (!this.actHandler) {
      throw new Error("Act handler not initialized");
    }

    useVision = useVision ?? "fallback";
    const requestId = Math.random().toString(36).substring(2);
    const llmClient: LLMClient = modelName
      ? this.llmProvider.getClient(modelName, modelClientOptions)
      : this.llmClient;

    this.log({
      category: "act",
      message: "running act",
      level: 1,
      auxiliary: {
        action: {
          value: action,
          type: "string",
        },
        requestId: {
          value: requestId,
          type: "string",
        },
        modelName: {
          value: llmClient.modelName,
          type: "string",
        },
      },
    });

    if (variables) {
      this.variables = { ...this.variables, ...variables };
    }

    return this.actHandler
      .act({
        action,
        llmClient,
        chunksSeen: [],
        useVision,
        verifierUseVision: useVision !== false,
        requestId,
        variables,
        previousSelectors: [],
        skipActionCacheForThisStep: false,
        domSettleTimeoutMs,
      })
      .catch((e) => {
        this.log({
          category: "act",
          message: "error acting",
          level: 1,
          auxiliary: {
            error: {
              value: e.message,
              type: "string",
            },
            trace: {
              value: e.stack,
              type: "string",
            },
          },
        });

        return {
          success: false,
          message: `Internal error: Error acting: ${e.message}`,
          action: action,
        };
      });
  }

  async extract<T extends z.AnyZodObject>({
    instruction,
    schema,
    modelName,
    modelClientOptions,
    domSettleTimeoutMs,
    useTextExtract,
  }: ExtractOptions<T>): Promise<ExtractResult<T>> {
    if (!this.extractHandler) {
      throw new Error("Extract handler not initialized");
    }

    const requestId = Math.random().toString(36).substring(2);
    const llmClient = modelName
      ? this.llmProvider.getClient(modelName, modelClientOptions)
      : this.llmClient;

    this.logger({
      category: "extract",
      message: "running extract",
      level: 1,
      auxiliary: {
        instruction: {
          value: instruction,
          type: "string",
        },
        requestId: {
          value: requestId,
          type: "string",
        },
        modelName: {
          value: llmClient.modelName,
          type: "string",
        },
      },
    });

    return this.extractHandler
      .extract({
        instruction,
        schema,
        llmClient,
        requestId,
        domSettleTimeoutMs,
        useTextExtract,
      })
      .catch((e) => {
        this.logger({
          category: "extract",
          message: "error extracting",
          level: 1,
          auxiliary: {
            error: {
              value: e.message,
              type: "string",
            },
            trace: {
              value: e.stack,
              type: "string",
            },
          },
        });

        if (this.enableCaching) {
          this.llmProvider.cleanRequestCache(requestId);
        }

        throw e;
      });
  }

  async observe(options?: ObserveOptions): Promise<ObserveResult[]> {
    if (!this.observeHandler) {
      throw new Error("Observe handler not initialized");
    }

    const requestId = Math.random().toString(36).substring(2);
    const llmClient = options?.modelName
      ? this.llmProvider.getClient(
          options.modelName,
          options.modelClientOptions,
        )
      : this.llmClient;

    this.logger({
      category: "observe",
      message: "running observe",
      level: 1,
      auxiliary: {
        instruction: {
          value: options?.instruction,
          type: "string",
        },
        requestId: {
          value: requestId,
          type: "string",
        },
        modelName: {
          value: llmClient.modelName,
          type: "string",
        },
      },
    });

    return this.observeHandler
      .observe({
        instruction:
          options?.instruction ??
          "Find actions that can be performed on this page.",
        llmClient,
        useVision: options?.useVision ?? false,
        fullPage: false,
        requestId,
        domSettleTimeoutMs: options?.domSettleTimeoutMs,
      })
      .catch((e) => {
        this.logger({
          category: "observe",
          message: "error observing",
          level: 1,
          auxiliary: {
            error: {
              value: e.message,
              type: "string",
            },
            trace: {
              value: e.stack,
              type: "string",
            },
            requestId: {
              value: requestId,
              type: "string",
            },
            instruction: {
              value: options?.instruction,
              type: "string",
            },
          },
        });

        if (this.enableCaching) {
          this.llmProvider.cleanRequestCache(requestId);
        }

        throw e;
      });
  }

  async close(): Promise<void> {
    await this.context.close();

    if (this.contextPath) {
      try {
        fs.rmSync(this.contextPath, { recursive: true, force: true });
      } catch (e) {
        console.error("Error deleting context directory:", e);
      }
    }
  }
}

export * from "../types/browser";
export * from "../types/log";
export * from "../types/model";
export * from "../types/playwright";
export * from "../types/stagehand";
