// This file provides stub types for the LangChain modules 
// so that our example can compile without having them installed.

declare module '@langchain/openai' {
  export class ChatOpenAI {
    constructor(args: { modelName: string; openAIApiKey: string; temperature?: number });
    bind(params: any): ChatOpenAI;
    invoke(messages: any[]): Promise<any>;
  }
}

declare module '@langchain/core/messages' {
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

declare module '@langchain/core/output_parsers' {
  export class StructuredOutputParser {
    static fromZodSchema(schema: any): StructuredOutputParser;
  }
} 