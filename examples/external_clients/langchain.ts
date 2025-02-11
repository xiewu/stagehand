import { ChatOpenAI } from "@langchain/openai";
import { ChatCompletion } from "openai/resources/chat/completions";
import {
  CreateChatCompletionOptions,
  LLMClient,
  AvailableModel,
} from "../../lib/llm/LLMClient";
import { AIMessage } from "@langchain/core/messages";
import { z } from "zod";

export class LangchainClient extends LLMClient {
  public type = "langchain" as const;
  private model: ChatOpenAI;

  constructor({ modelName, apiKey }: { modelName: string; apiKey: string }) {
    super(modelName as AvailableModel);
    this.model = new ChatOpenAI({
      modelName: modelName,
      openAIApiKey: apiKey,
      temperature: 0,
    });
  }

  async createChatCompletion<T = ChatCompletion>({
    options,
  }: CreateChatCompletionOptions): Promise<T> {
    // Convert messages to LangChain format
    const messages = options.messages.map((msg) => {
      if (Array.isArray(msg.content)) {
        // Handle multimodal content
        const content = msg.content
          .map((part) => {
            if ("text" in part) {
              return part.text;
            } else if ("image_url" in part) {
              return `[Image: ${part.image_url.url}]`;
            }
            return "";
          })
          .join("\n");

        return {
          role: msg.role,
          content: content,
        };
      }
      return msg;
    });

    // Handle tools if present
    if (options.tools?.length) {
      const tools = options.tools.map((tool) => ({
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
      this.model = this.model.bind({ tools });
    }

    let response;
    if (options.response_model) {
      const structuredModel = this.model.withStructuredOutput(
        options.response_model.schema,
      );
      response = await structuredModel.invoke(messages);
      console.log("response", response);
      return response as T;
    } else {
      response = await this.model.invoke(messages);
      console.log("response", response);
    }

    // Normalize tool calls to match expected format
    let toolCalls = [];
    if ((response as any).tool_calls) {
      toolCalls = (response as any).tool_calls.map((tc: any) => ({
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.args),
        },
      }));
    }

    // Convert LangChain response format to match expected format
    const formattedResponse = {
      id: (response as any).id,
      choices: [
        {
          message: {
            role: "assistant",
            content: (response as any).content,
            tool_calls: toolCalls,
          },
          finish_reason: (response as any).response_metadata?.finish_reason,
        },
      ],
      usage: {
        prompt_tokens: (response as any).usage_metadata?.input_tokens,
        completion_tokens: (response as any).usage_metadata?.output_tokens,
        total_tokens: (response as any).usage_metadata?.total_tokens,
      },
    };
    console.log("formattedResponse", formattedResponse.choices[0].message);

    return formattedResponse as T;
  }
}
