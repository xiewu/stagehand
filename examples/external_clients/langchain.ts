import { ChatOpenAI } from "@langchain/openai";
import { ChatCompletion } from "openai/resources/chat/completions";
import { CreateChatCompletionOptions, LLMClient, AvailableModel } from "../../lib/llm/LLMClient";
import { AIMessage } from "@langchain/core/messages";

export class LangchainClient extends LLMClient {
  public type = "langchain" as const;
  private model: ChatOpenAI;

  constructor({ modelName, apiKey }: { modelName: string; apiKey: string }) {
    super(modelName as AvailableModel);
    this.model = new ChatOpenAI({
      modelName: modelName,
      openAIApiKey: apiKey,
      temperature: 0
    });
  }

  async createChatCompletion<T = ChatCompletion>({
    options,
  }: CreateChatCompletionOptions): Promise<T> {
    // Convert messages to LangChain format
    const messages = options.messages.map(msg => {
      if (Array.isArray(msg.content)) {
        // Handle multimodal content
        const content = msg.content.map(part => {
          if ("text" in part) {
            return part.text;
          } else if ("image_url" in part) {
            return `[Image: ${part.image_url.url}]`;
          }
          return "";
        }).join("\n");
        
        return {
          role: msg.role,
          content: content
        };
      }
      return msg;
    });

    // Handle tools if present
    if (options.tools?.length) {
      const tools = options.tools.map(tool => ({
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      }));
      this.model = this.model.bind({ tools });
    }

    const response = await this.model.invoke(messages);

    // Convert LangChain response format to match expected format
    const formattedResponse = {
      id: (response as AIMessage).id,
      choices: [{
        message: {
          role: "assistant",
          content: (response as AIMessage).content,
          tool_calls: (response as AIMessage).tool_calls
        },
        finish_reason: (response as AIMessage).response_metadata?.finish_reason
      }],
      usage: {
        prompt_tokens: (response as AIMessage).usage_metadata?.input_tokens,
        completion_tokens: (response as AIMessage).usage_metadata?.output_tokens,
        total_tokens: (response as AIMessage).usage_metadata?.total_tokens
      }
    };

    return formattedResponse as T;
  }
}
