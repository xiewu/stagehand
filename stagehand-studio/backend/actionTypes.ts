import { z } from "zod";

export type AvailableModel =
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gpt-4o-2024-08-06"
  | "claude-3-5-sonnet-latest"
  | "claude-3-5-sonnet-20241022"
  | "claude-3-5-sonnet-20240620";

export type Action = {
  actionType: "action";
  instruction: string;
  modelName?: AvailableModel;
  useVision?: "fallback" | boolean;
};

export type Extract<T extends z.AnyZodObject> = {
  actionType: "extract";
  instruction: string;
  schema: T;
  modelName?: AvailableModel;
};

export type Navigate = {
  actionType: "navigate";
  url: string;
};

export type StagehandAction = Action | Extract<z.AnyZodObject> | Navigate;
