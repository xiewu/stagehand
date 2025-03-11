import fs from "fs";
import path from "path";
import { z } from "zod";
import { ActCommandParams, ActCommandResult } from "../types/act";
import { VerifyActCompletionParams } from "../types/inference";
import { LogLine } from "../types/log";
import { ChatMessage, LLMClient, LLMResponse } from "./llm/LLMClient";
import {
  actTools,
  buildActSystemPrompt,
  buildActUserPrompt,
  buildExtractSystemPrompt,
  buildExtractUserPrompt,
  buildMetadataPrompt,
  buildMetadataSystemPrompt,
  buildObserveSystemPrompt,
  buildObserveUserMessage,
  buildRefineSystemPrompt,
  buildRefineUserPrompt,
  buildVerifyActCompletionSystemPrompt,
  buildVerifyActCompletionUserPrompt,
} from "./prompt";

/**
 * Replaces <|VARIABLE|> placeholders in a text with user-provided values.
 */
export function fillInVariables(
  text: string,
  variables: Record<string, string>,
) {
  let processedText = text;
  Object.entries(variables).forEach(([key, value]) => {
    const placeholder = `<|${key.toUpperCase()}|>`;
    processedText = processedText.replace(placeholder, value);
  });
  return processedText;
}

/** Simple usage shape if your LLM returns usage tokens. */
interface LLMUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * For calls that use a schema: the LLMClient may return { data: T; usage?: LLMUsage }
 */
interface LLMParsedResponse<T> {
  data: T;
  usage?: LLMUsage;
}

/** Summaries for "act". */
interface ActSummaryEntry {
  act_inference_type: string;
  timestamp: string;
  LLM_input_file: string;
  LLM_output_file: string;
  prompt_tokens: number;
  completion_tokens: number;
  inference_time_ms: number;
}
interface ActSummaryFile {
  act_summary: ActSummaryEntry[];
}

/** Summaries for "observe". */
interface ObserveSummaryEntry {
  observe_inference_type: string;
  timestamp: string;
  LLM_input_file: string;
  LLM_output_file: string;
  prompt_tokens: number;
  completion_tokens: number;
  inference_time_ms: number;
}

/**
 * Create (or ensure) a parent directory named "inference_summary".
 */
function ensureInferenceSummaryDir(): string {
  const inferenceDir = path.join(process.cwd(), "inference_summary");
  if (!fs.existsSync(inferenceDir)) {
    fs.mkdirSync(inferenceDir, { recursive: true });
  }
  return inferenceDir;
}

/** A simple timestamp utility for filenames. */
function getTimestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[^0-9T]/g, "")
    .replace("T", "_");
}

/**
 * Writes `data` as JSON into a file in `directory`, using a prefix plus timestamp.
 * Returns both the file name and the timestamp used, so you can log them.
 */
function writeTimestampedJsonFile(
  directory: string,
  prefix: string,
  data: unknown,
): { fileName: string; timestamp: string } {
  const timestamp = getTimestamp();
  const fileName = `${prefix}_${timestamp}.txt`;
  const filePath = path.join(directory, fileName);
  fs.writeFileSync(
    filePath,
    JSON.stringify(data, null, 2).replace(/\\n/g, "\n"),
  );
  return { fileName, timestamp };
}

function ensureActSummaryDir(): string {
  const inferenceDir = ensureInferenceSummaryDir();
  const dirPath = path.join(inferenceDir, "act_summary");
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

function readActSummaryFile(jsonPath: string): ActSummaryFile {
  if (fs.existsSync(jsonPath)) {
    try {
      const raw = fs.readFileSync(jsonPath, "utf8");
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray(parsed.act_summary)
      ) {
        return parsed;
      }
    } catch {
      /* empty */
    }
  }
  return { act_summary: [] };
}

/**
 * Appends a new entry to the act_summary.json file, then writes the file back out.
 */
function appendActSummary(summaryPath: string, entry: ActSummaryEntry) {
  const existingSummary = readActSummaryFile(summaryPath);
  existingSummary.act_summary.push(entry);
  fs.writeFileSync(summaryPath, JSON.stringify(existingSummary, null, 2));
}

function ensureObserveSummaryDir(): string {
  const inferenceDir = ensureInferenceSummaryDir();
  const dirPath = path.join(inferenceDir, "observe_summary");
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

function ensureExtractSummaryDir(): string {
  const inferenceDir = ensureInferenceSummaryDir();
  const dirPath = path.join(inferenceDir, "extract_summary");
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

export interface VerifyActCompletionResult {
  completed: boolean;
  prompt_tokens: number;
  completion_tokens: number;
  inference_time_ms: number;
}

export async function verifyActCompletion({
  goal,
  steps,
  llmClient,
  domElements,
  logger,
  requestId,
  logInferenceToFile = false,
}: VerifyActCompletionParams & {
  logInferenceToFile?: boolean;
}): Promise<VerifyActCompletionResult> {
  const verificationSchema = z.object({
    completed: z.boolean().describe("true if the goal is accomplished"),
  });
  type VerificationResponse = z.infer<typeof verificationSchema>;

  const messages: ChatMessage[] = [
    buildVerifyActCompletionSystemPrompt(),
    buildVerifyActCompletionUserPrompt(goal, steps, domElements),
  ];

  let actDir = "";
  let actSummaryPath = "";

  // Only do these if logging is on
  if (logInferenceToFile) {
    actDir = ensureActSummaryDir(); // e.g. "inference_summary/act_summary"
    actSummaryPath = path.join(actDir, "act_summary.json");
  }

  // If logging is on, write a "verify_call" file
  let callFile = "";
  let callTimestamp = "";
  if (logInferenceToFile) {
    const callResult = writeTimestampedJsonFile(actDir, "verify_call", {
      requestId,
      modelCall: "verifyActCompletion",
      messages,
    });
    callFile = callResult.fileName;
    callTimestamp = callResult.timestamp;
  }

  // Time the LLM call
  const start = Date.now();
  const rawResponse =
    await llmClient.createChatCompletion<VerificationResponse>({
      options: {
        messages,
        temperature: 0.1,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
        response_model: {
          name: "Verification",
          schema: verificationSchema,
        },
        requestId,
      },
      logger,
    });
  const end = Date.now();
  const inferenceTimeMs = end - start;

  const parsedResponse = rawResponse as LLMParsedResponse<VerificationResponse>;
  const verificationData = parsedResponse.data;
  const verificationUsage = parsedResponse.usage;

  // If logging is on, write a "verify_response" file
  let responseFile = "";
  if (logInferenceToFile) {
    const responseResult = writeTimestampedJsonFile(actDir, "verify_response", {
      requestId,
      modelResponse: "verifyActCompletion",
      rawResponse: verificationData,
    });
    responseFile = responseResult.fileName;

    // Also append usage/time to act_summary.json
    appendActSummary(actSummaryPath, {
      act_inference_type: "verifyActCompletion",
      timestamp: callTimestamp,
      LLM_input_file: callFile,
      LLM_output_file: responseFile,
      prompt_tokens: verificationUsage?.prompt_tokens ?? 0,
      completion_tokens: verificationUsage?.completion_tokens ?? 0,
      inference_time_ms: inferenceTimeMs,
    });
  }

  // Validate & return
  if (!verificationData || typeof verificationData !== "object") {
    logger({
      category: "VerifyAct",
      message: "Unexpected response format: " + JSON.stringify(parsedResponse),
    });
    return {
      completed: false,
      prompt_tokens: verificationUsage?.prompt_tokens ?? 0,
      completion_tokens: verificationUsage?.completion_tokens ?? 0,
      inference_time_ms: inferenceTimeMs,
    };
  }
  if (verificationData.completed === undefined) {
    logger({
      category: "VerifyAct",
      message: "Missing 'completed' field in response",
    });
    return {
      completed: false,
      prompt_tokens: verificationUsage?.prompt_tokens ?? 0,
      completion_tokens: verificationUsage?.completion_tokens ?? 0,
      inference_time_ms: inferenceTimeMs,
    };
  }

  return {
    completed: verificationData.completed,
    prompt_tokens: verificationUsage?.prompt_tokens ?? 0,
    completion_tokens: verificationUsage?.completion_tokens ?? 0,
    inference_time_ms: inferenceTimeMs,
  };
}


export async function act({
  action,
  domElements,
  steps,
  llmClient,
  retries = 0,
  logger,
  requestId,
  variables,
  userProvidedInstructions,
  onActMetrics,
  logInferenceToFile = false,
}: ActCommandParams & {
  onActMetrics?: (
    promptTokens: number,
    completionTokens: number,
    inferenceTimeMs: number,
  ) => void;
  logInferenceToFile?: boolean;
}): Promise<ActCommandResult | null> {
  const messages: ChatMessage[] = [
    buildActSystemPrompt(userProvidedInstructions),
    buildActUserPrompt(action, steps, domElements, variables),
  ];

  let actDir = "";
  let actSummaryPath = "";
  if (logInferenceToFile) {
    actDir = ensureActSummaryDir();
    actSummaryPath = path.join(actDir, "act_summary.json");
  }

  let callFile = "";
  let callTimestamp = "";
  if (logInferenceToFile) {
    const callResult = writeTimestampedJsonFile(actDir, "act_call", {
      requestId,
      modelCall: "act",
      messages,
    });
    callFile = callResult.fileName;
    callTimestamp = callResult.timestamp;
  }

  const start = Date.now();
  const rawResponse = await llmClient.createChatCompletion<LLMResponse>({
    options: {
      messages,
      temperature: 0.1,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      tool_choice: "auto",
      tools: actTools,
      requestId,
    },
    logger,
  });
  const end = Date.now();

  let responseFile = "";
  if (logInferenceToFile) {
    const responseResult = writeTimestampedJsonFile(actDir, "act_response", {
      requestId,
      modelResponse: "act",
      rawResponse,
    });
    responseFile = responseResult.fileName;
  }

  const usageData = rawResponse.usage;
  const promptTokens = usageData?.prompt_tokens ?? 0;
  const completionTokens = usageData?.completion_tokens ?? 0;
  const inferenceTimeMs = end - start;

  if (logInferenceToFile) {
    appendActSummary(actSummaryPath, {
      act_inference_type: "act",
      timestamp: callTimestamp,
      LLM_input_file: callFile,
      LLM_output_file: responseFile,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      inference_time_ms: inferenceTimeMs,
    });
  }

  if (onActMetrics) {
    onActMetrics(promptTokens, completionTokens, inferenceTimeMs);
  }

  const toolCalls = rawResponse.choices?.[0]?.message?.tool_calls;
  if (toolCalls && toolCalls.length > 0) {
    if (toolCalls[0].function.name === "skipSection") {
      return null;
    }
    return JSON.parse(toolCalls[0].function.arguments);
  } else {
    if (retries >= 2) {
      logger({
        category: "Act",
        message: "No tool calls found in response after multiple retries.",
      });
      return null;
    }

    return act({
      action,
      domElements,
      steps,
      llmClient,
      retries: retries + 1,
      logger,
      requestId,
      variables,
      userProvidedInstructions,
      onActMetrics,
      logInferenceToFile,
    });
  }
}

export async function extract({
  instruction,
  previouslyExtractedContent,
  domElements,
  schema,
  llmClient,
  chunksSeen,
  chunksTotal,
  requestId,
  logger,
  isUsingTextExtract,
  userProvidedInstructions,
  logInferenceToFile = false,
}: {
  instruction: string;
  previouslyExtractedContent: object;
  domElements: string;
  schema: z.ZodObject<z.ZodRawShape>;
  llmClient: LLMClient;
  chunksSeen: number;
  chunksTotal: number;
  requestId: string;
  isUsingTextExtract?: boolean;
  userProvidedInstructions?: string;
  logger: (message: LogLine) => void;
  /**
   * If true, we write call/response files and an extraction_summary.json
   * If false, we skip writing these logs to the filesystem
   */
  logInferenceToFile?: boolean;
}) {
  const metadataSchema = z.object({
    progress: z
      .string()
      .describe(
        "progress of what has been extracted so far, as concise as possible",
      ),
    completed: z
      .boolean()
      .describe(
        "true if the goal is now accomplished. Use this conservatively, only when sure that the goal has been completed.",
      ),
  });

  type ExtractionResponse = z.infer<typeof schema>;
  type MetadataResponse = z.infer<typeof metadataSchema>;

  const isUsingAnthropic = llmClient.type === "anthropic";

  // This directory is only relevant if we log to file
  let extractSummaryDir = "";
  if (logInferenceToFile) {
    extractSummaryDir = ensureExtractSummaryDir();
  }

  // We'll store per-step data for the final summary JSON
  const summaryData = {
    extraction_summary: [] as Array<{
      extract_inference_type: string;
      timestamp: string;
      LLM_input_file: string;
      LLM_output_file: string;
      prompt_tokens: number;
      completion_tokens: number;
      inference_time_ms: number;
    }>,
  };

  const extractCallMessages: ChatMessage[] = [
    buildExtractSystemPrompt(
      isUsingAnthropic,
      isUsingTextExtract,
      userProvidedInstructions,
    ),
    buildExtractUserPrompt(instruction, domElements, isUsingAnthropic),
  ];

  // If we are logging to file, write the "extract_call" file
  let extractCallTimestamp = getTimestamp();
  let extractCallFile = "";
  if (logInferenceToFile) {
    const result = writeTimestampedJsonFile(extractSummaryDir, "extract_call", {
      requestId,
      modelCall: "extract",
      messages: extractCallMessages,
    });
    extractCallFile = result.fileName;
    extractCallTimestamp = result.timestamp;
  }

  const extractStartTime = Date.now();
  const extractionResponse =
    await llmClient.createChatCompletion<ExtractionResponse>({
      options: {
        messages: extractCallMessages,
        response_model: {
          schema,
          name: "Extraction",
        },
        temperature: 0.1,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
        requestId,
      },
      logger,
    });
  const extractEndTime = Date.now();

  const { data: extractedData, usage: extractUsage } =
    extractionResponse as LLMParsedResponse<ExtractionResponse>;

  // If we are logging to file, write the "extract_response" file
  let extractResponseFile = "";
  if (logInferenceToFile) {
    const responseResult = writeTimestampedJsonFile(
      extractSummaryDir,
      "extract_response",
      {
        requestId,
        modelResponse: "extract",
        rawResponse: extractedData,
      },
    );
    extractResponseFile = responseResult.fileName;
  }

  summaryData.extraction_summary.push({
    extract_inference_type: "extraction",
    timestamp: extractCallTimestamp,
    LLM_input_file: extractCallFile,
    LLM_output_file: extractResponseFile,
    prompt_tokens: extractUsage?.prompt_tokens ?? 0,
    completion_tokens: extractUsage?.completion_tokens ?? 0,
    inference_time_ms: extractEndTime - extractStartTime,
  });

  const refineCallMessages: ChatMessage[] = [
    buildRefineSystemPrompt(),
    buildRefineUserPrompt(
      instruction,
      previouslyExtractedContent,
      extractionResponse.data,
    ),
  ];

  let refineCallTimestamp = getTimestamp();
  let refineCallFile = "";
  if (logInferenceToFile) {
    const result = writeTimestampedJsonFile(extractSummaryDir, "refine_call", {
      requestId,
      modelCall: "refine",
      messages: refineCallMessages,
    });
    refineCallFile = result.fileName;
    refineCallTimestamp = result.timestamp;
  }

  const refineStartTime = Date.now();
  const refinedResponse =
    await llmClient.createChatCompletion<ExtractionResponse>({
      options: {
        messages: refineCallMessages,
        response_model: {
          schema,
          name: "RefinedExtraction",
        },
        temperature: 0.1,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
        requestId,
      },
      logger,
    });
  const refineEndTime = Date.now();

  const { data: refinedResponseData, usage: refinedResponseUsage } =
    refinedResponse as LLMParsedResponse<ExtractionResponse>;

  let refineResponseFile = "";
  if (logInferenceToFile) {
    const responseResult = writeTimestampedJsonFile(
      extractSummaryDir,
      "refine_response",
      {
        requestId,
        modelResponse: "refine",
        rawResponse: refinedResponseData,
      },
    );
    refineResponseFile = responseResult.fileName;
  }

  summaryData.extraction_summary.push({
    extract_inference_type: "refinement",
    timestamp: refineCallTimestamp,
    LLM_input_file: refineCallFile,
    LLM_output_file: refineResponseFile,
    prompt_tokens: refinedResponseUsage?.prompt_tokens ?? 0,
    completion_tokens: refinedResponseUsage?.completion_tokens ?? 0,
    inference_time_ms: refineEndTime - refineStartTime,
  });

  const metadataCallMessages: ChatMessage[] = [
    buildMetadataSystemPrompt(),
    buildMetadataPrompt(
      instruction,
      refinedResponseData,
      chunksSeen,
      chunksTotal,
    ),
  ];

  let metadataCallTimestamp = getTimestamp();
  let metadataCallFile = "";
  if (logInferenceToFile) {
    const result = writeTimestampedJsonFile(
      extractSummaryDir,
      "metadata_call",
      {
        requestId,
        modelCall: "metadata",
        messages: metadataCallMessages,
      },
    );
    metadataCallFile = result.fileName;
    metadataCallTimestamp = result.timestamp;
  }

  const metadataStartTime = Date.now();
  const metadataResponse =
    await llmClient.createChatCompletion<MetadataResponse>({
      options: {
        messages: metadataCallMessages,
        response_model: {
          name: "Metadata",
          schema: metadataSchema,
        },
        temperature: 0.1,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
        requestId,
      },
      logger,
    });
  const metadataEndTime = Date.now();

  const {
    data: {
      completed: metadataResponseCompleted,
      progress: metadataResponseProgress,
    },
    usage: metadataResponseUsage,
  } = metadataResponse as LLMParsedResponse<MetadataResponse>;

  let metadataResponseFile = "";
  if (logInferenceToFile) {
    const responseResult = writeTimestampedJsonFile(
      extractSummaryDir,
      "metadata_response",
      {
        requestId,
        modelResponse: "metadata",
        completed: metadataResponseCompleted,
        progress: metadataResponseProgress,
      },
    );
    metadataResponseFile = responseResult.fileName;
  }

  summaryData.extraction_summary.push({
    extract_inference_type: "metadata",
    timestamp: metadataCallTimestamp,
    LLM_input_file: metadataCallFile,
    LLM_output_file: metadataResponseFile,
    prompt_tokens: metadataResponseUsage?.prompt_tokens ?? 0,
    completion_tokens: metadataResponseUsage?.completion_tokens ?? 0,
    inference_time_ms: metadataEndTime - metadataStartTime,
  });

  //
  // 4) If logging to file, write extraction_summary.json
  //
  if (logInferenceToFile) {
    fs.writeFileSync(
      path.join(extractSummaryDir, "extraction_summary.json"),
      JSON.stringify(summaryData, null, 2),
    );
  }

  //
  // 5) Return final object with aggregated tokens/time
  //
  const totalPromptTokens =
    (extractUsage?.prompt_tokens ?? 0) +
    (refinedResponseUsage?.prompt_tokens ?? 0) +
    (metadataResponseUsage?.prompt_tokens ?? 0);

  const totalCompletionTokens =
    (extractUsage?.completion_tokens ?? 0) +
    (refinedResponseUsage?.completion_tokens ?? 0) +
    (metadataResponseUsage?.completion_tokens ?? 0);

  const totalInferenceTimeMs =
    extractEndTime -
    extractStartTime +
    (refineEndTime - refineStartTime) +
    (metadataEndTime - metadataStartTime);

  return {
    ...refinedResponseData,
    metadata: {
      completed: metadataResponseCompleted,
      progress: metadataResponseProgress,
    },
    prompt_tokens: totalPromptTokens,
    completion_tokens: totalCompletionTokens,
    inference_time_ms: totalInferenceTimeMs,
  };
}

export async function observe({
  instruction,
  domElements,
  llmClient,
  requestId,
  isUsingAccessibilityTree,
  userProvidedInstructions,
  logger,
  returnAction = false,
  logInferenceToFile = false,
}: {
  instruction: string;
  domElements: string;
  llmClient: LLMClient;
  requestId: string;
  userProvidedInstructions?: string;
  logger: (message: LogLine) => void;
  isUsingAccessibilityTree?: boolean;
  returnAction?: boolean;
  logInferenceToFile?: boolean;
}) {
  const observeSchema = z.object({
    elements: z
      .array(
        z.object({
          elementId: z.number().describe("the number of the element"),
          description: z
            .string()
            .describe(
              isUsingAccessibilityTree
                ? "a description of the accessible element and its purpose"
                : "a description of the element and what it is relevant for",
            ),
          ...(returnAction
            ? {
                method: z
                  .string()
                  .describe(
                    "the candidate method/action to interact with the element. Select one of the available Playwright interaction methods.",
                  ),
                arguments: z.array(
                  z
                    .string()
                    .describe(
                      "the arguments to pass to the method. For example, for a click, the arguments are empty, but for a fill, the arguments are the value to fill in.",
                    ),
                ),
              }
            : {}),
        }),
      )
      .describe(
        isUsingAccessibilityTree
          ? "an array of accessible elements that match the instruction"
          : "an array of elements that match the instruction",
      ),
  });

  type ObserveResponse = z.infer<typeof observeSchema>;

  // 2) Build system/user messages
  const messages: ChatMessage[] = [
    buildObserveSystemPrompt(
      userProvidedInstructions,
      isUsingAccessibilityTree,
    ),
    buildObserveUserMessage(instruction, domElements, isUsingAccessibilityTree),
  ];

  // If logging to file is false, skip all directory/file writes
  let observeDir = "";
  let callTimestamp = "";
  let callFile = "";
  let responseFile = "";

  if (logInferenceToFile) {
    // Ensure the "inference_summary/observe_summary" directory
    observeDir = ensureObserveSummaryDir(); // <--- your local directory function

    // Write the "observe_call" file
    const { fileName, timestamp } = writeTimestampedJsonFile(
      observeDir,
      "observe_call",
      {
        requestId,
        modelCall: "observe",
        messages,
      },
    );
    callFile = fileName;
    callTimestamp = timestamp;
  }

  // 3) Make the LLM call
  const start = Date.now();
  const rawResponse = await llmClient.createChatCompletion<ObserveResponse>({
    options: {
      messages,
      response_model: {
        schema: observeSchema,
        name: "Observation",
      },
      temperature: 0.1,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      requestId,
    },
    logger,
  });
  const end = Date.now();
  const usageTimeMs = end - start;

  const { data: observeData, usage: observeUsage } =
    rawResponse as LLMParsedResponse<ObserveResponse>;
  const promptTokens = observeUsage?.prompt_tokens ?? 0;
  const completionTokens = observeUsage?.completion_tokens ?? 0;

  // 4) If logging to file, write the "observe_response" file & update summary
  if (logInferenceToFile && observeDir) {
    const { fileName: responseFileName } = writeTimestampedJsonFile(
      observeDir,
      "observe_response",
      {
        requestId,
        modelResponse: "observe",
        rawResponse: observeData,
      },
    );
    responseFile = responseFileName;

    // Now update the "observe_summary.json"
    const observeSummaryPath = path.join(observeDir, "observe_summary.json");

    // read or start new structure
    let existingData: { observe_summary: ObserveSummaryEntry[] } = {
      observe_summary: [],
    };
    if (fs.existsSync(observeSummaryPath)) {
      try {
        const raw = fs.readFileSync(observeSummaryPath, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.observe_summary)) {
          existingData = parsed;
        }
      } catch {
        // ignore parse errors
      }
    }

    // push new entry
    existingData.observe_summary.push({
      observe_inference_type: "observe",
      timestamp: callTimestamp,
      LLM_input_file: callFile,
      LLM_output_file: responseFile,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      inference_time_ms: usageTimeMs,
    });

    // write back out
    fs.writeFileSync(
      observeSummaryPath,
      JSON.stringify(existingData, null, 2).replace(/\\n/g, "\n"),
    );
  }

  // 5) Convert final data
  const parsedElements =
    observeData.elements?.map((el) => {
      const base = {
        elementId: Number(el.elementId),
        description: String(el.description),
      };
      if (returnAction) {
        return {
          ...base,
          method: String(el.method),
          arguments: el.arguments,
        };
      }
      return base;
    }) ?? [];

  // 6) Return usage/time plus elements
  return {
    elements: parsedElements,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    inference_time_ms: usageTimeMs,
  };
}
