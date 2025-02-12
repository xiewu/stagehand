// This file provides stub types for the LangChain modules
// so that our example can compile without having them installed.

declare module "@langchain/openai" {
  interface LangChainResponse {
    content?: string;
    additional_kwargs?: {
      tool_calls?: Array<{
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
  }

  export class ChatOpenAI {
    constructor(args: {
      modelName: string;
      openAIApiKey: string;
      temperature?: number;
    });
    bind(params: unknown): ChatOpenAI;
    invoke(messages: unknown[]): Promise<LangChainResponse>;
  }
}

declare module "@langchain/core/messages" {
  export class HumanMessage {
    constructor(content: string);
  }
  export class AIMessage {
    constructor(content: string);
  }
  export class SystemMessage {
    constructor(content: string);
  }
}

declare module "@langchain/core/output_parsers" {
  export class StructuredOutputParser {
    static fromZodSchema(schema: unknown): StructuredOutputParser;
  }
}
