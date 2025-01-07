import {
  CoreAssistantMessage,
  CoreMessage,
  CoreSystemMessage,
  CoreTool,
  CoreUserMessage,
  generateObject,
  generateText,
  ImagePart,
  LanguageModel,
  TextPart,
} from "ai";
import { ChatCompletion } from "openai/resources/chat/completions";
import { ChatCompletionOptions, LLMClient } from "../../lib/llm/LLMClient";
import type { LogLine } from "../../types/log";
import { AvailableModel } from "../../types/model";

export class AISdkClient extends LLMClient {
  public type = "aisdk" as const;
  public logger: (message: LogLine) => void;
  private model: LanguageModel;

  constructor({
    logger,
    model,
  }: {
    logger?: (message: LogLine) => void;
    model: LanguageModel;
  }) {
    super(model.modelId as AvailableModel);
    this.logger = logger;
    this.model = model;
  }

  async createChatCompletion<T = ChatCompletion>(
    options: ChatCompletionOptions,
  ): Promise<T> {
    const formattedMessages: CoreMessage[] = options.messages.map((message) => {
      if (Array.isArray(message.content)) {
        if (message.role === "system") {
          const systemMessage: CoreSystemMessage = {
            role: "system",
            content: message.content
              .map((c) => ("text" in c ? c.text : ""))
              .join("\n"),
          };
          return systemMessage;
        }

        const contentParts = message.content.map((content) => {
          if ("image_url" in content) {
            const imageContent: ImagePart = {
              type: "image",
              image: content.image_url.url,
            };
            return imageContent;
          } else {
            const textContent: TextPart = {
              type: "text",
              text: content.text,
            };
            return textContent;
          }
        });

        if (message.role === "user") {
          const userMessage: CoreUserMessage = {
            role: "user",
            content: contentParts,
          };
          return userMessage;
        } else {
          const textOnlyParts = contentParts.map((part) => ({
            type: "text" as const,
            text: part.type === "image" ? "[Image]" : part.text,
          }));
          const assistantMessage: CoreAssistantMessage = {
            role: "assistant",
            content: textOnlyParts,
          };
          return assistantMessage;
        }
      }

      return {
        role: message.role,
        content: message.content,
      };
    });

    if (options.response_model) {
      const response = await generateObject({
        model: this.model,
        messages: formattedMessages,
        schema: options.response_model.schema,
      });

      return response.object;
    }

    const tools: Record<string, CoreTool> = {};

    for (const rawTool of options.tools) {
      tools[rawTool.name] = {
        description: rawTool.description,
        parameters: rawTool.parameters,
      };
    }

    const response = await generateText({
      model: this.model,
      messages: formattedMessages,
      tools,
    });

    return response as T;
  }
}
