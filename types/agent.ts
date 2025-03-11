/**
 * Types for Agent interfaces in Stagehand
 */

/**
 * Represents an action performed by an agent
 */
export interface AgentAction {
  type: string;
  [key: string]: unknown;
}

/**
 * Result of an agent execution
 */
export interface AgentResult {
  success: boolean;
  message: string;
  actions: AgentAction[];
  completed: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Options for agent execution
 */
export interface AgentOptions {
  maxSteps?: number;
  autoScreenshot?: boolean;
  waitBetweenActions?: number;
  context?: string;
}

/**
 * Options for executing a task with an agent
 */
export interface AgentExecuteOptions extends AgentOptions {
  instruction: string;
}

/**
 * Types of agent providers supported
 */
export type AgentProviderType = "openai" | "anthropic";

/**
 * Common options for agent clients
 */
export interface AgentClientOptions {
  apiKey: string;
  organization?: string;
  baseURL?: string;
  defaultMaxSteps?: number;
  [key: string]: unknown;
}





// OPENAI Types

export type InputItem = EasyMessage | FunctionOutput | ComputerCallOutput;

export type Tool = FunctionTool | ComputerTool;

export type Item = Message | FunctionToolCall | ComputerToolCall | Reasoning;

export type InputContent = InputText | InputImage;

export type OutputContent = OutputText | Refusal;

export type Content = InputContent | OutputContent | Reasoning;

export interface EasyMessage {
  role: "system" | "user" | "assistant" | "developer";
  content: string | InputContent[];
}

export type OutputText = {
  type: "output_text";
  text: string;
  logprobs?: LogProb[] | null;
};

export type Reasoning = {
  id: string;
  type: "reasoning";
  content: [];
};

export type Refusal = {
  type: "refusal";
  refusal: string;
};

export type InputText = {
  type: "input_text";
  text: string;
};

export type InputImage = {
  type: "input_image";
  image_url?: string;
  file_id?: string;
  detail: "high" | "low" | "auto";
};

export type LogProb = {
  token: string;
  logprob: number;
  bytes: number[];
  top_logprobs?: LogProb[];
};

export type Message = {
  id: string;
  type: "message";
  role: "user" | "assistant" | "developer" | "system";
  content: Content[];
};

export interface FunctionOutput {
  type: "function_call_output";
  call_id: string;
  output: string;
}

export interface ComputerCallOutput {
  type: "computer_call_output";
  call_id: string;
  output: { type: "input_image"; image_url: string };
  // acknowledged_safety_checks: SafetyCheck[];
  current_url?: string;
}

export interface ComputerTool {
  type: "computer-preview";
  display_width: number;
  display_height: number;
  environment: "browser";
}

export interface FunctionTool {
  type: "function";
  name: string;
  description: string | null;
  parameters: object;
  strict: boolean;
}

export interface FunctionToolCall {
  type: "function_call";
  id: string;
  call_id: string;
  name: string;
  arguments: string;
  output: Content[] | null;
}

export interface ComputerToolCall {
  type: "computer_call";
  id: string;
  call_id: string;
  action: ComputerAction;
}

export type ComputerAction =
  | Click
  | DoubleClick
  | Drag
  | Screenshot
  | KeyPress
  | Move
  | Scroll
  | Type
  | Wait;

export type Click = {
  type: "click";
  button: "left" | "right" | "wheel" | "back" | "forward";
  x: number;
  y: number;
};

export type DoubleClick = {
  type: "double_click";
  x: number;
  y: number;
};

export type Scroll = {
  type: "scroll";
  x: number;
  y: number;
  scroll_x: number;
  scroll_y: number;
};

export type Type = {
  type: "type";
  text: string;
};

export type Wait = {
  type: "wait";
};

export type KeyPress = {
  type: "keypress";
  keys: string[];
};

export type Drag = {
  type: "drag";
  path: {
    x: number;
    y: number;
  }[];
};

export type Screenshot = {
  type: "screenshot";
};

export type Move = {
  type: "move";
  x: number;
  y: number;
};

export type RequestOptions = {
  model: string;
  input?: string | InputItem[];
  previous_response_id?: string;
  tools?: Tool[];

  metadata?: Record<string, string>;
  tool_choice?:
    | "none"
    | "auto" // default
    | "required"
    | { type: "file_search" }
    | { type: "computer" }
    | { type: "function"; name: string };
  text?: {
    format?:
      | { type: "text" } // default
      | { type: "json_object" }
      | {
          type: "json_schema";
          schema: object;
          name: string;
          description?: string;
          strict?: boolean; // default true
        };
  };
  temperature?: number; // default 1
  top_p?: number; // default 1
  truncation?: "auto" | "disabled";
  parallel_tool_calls?: boolean; // default true
  stream?: boolean;
  reasoning?: { effort?: "low" | "medium" | "high" };
};

export type Response = {
  id: string;
  object: "response";
  created_at: number;
  completed_at: number | null;
  error: Error | null;
  model: string;
  tools: Tool[];
  tool_choice:
    | "none"
    | "auto"
    | "required"
    | { type: "file_search" }
    | { type: "code_interpreter" }
    | { type: "function"; name: string };
  text: {
    response_format:
      | { type: "text" } // default
      | { type: "json_object" }
      | {
          type: "json_schema";
          schema: object;
          name: string;
          description?: string;
          strict: boolean | null;
        };
  };
  previous_response_id: string | null;
  output: Item[];
  metadata: Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  usage: any | null;
};
