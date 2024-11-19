import express, { Request, Response } from "express";
import { Stagehand } from "../../lib";
import { Action, AvailableModel, StagehandAction } from "./actionTypes";
import { z } from "zod";
import OpenAI from "openai";
import dotenv from "dotenv";
import { EvalLogger } from "./logger";
import { WebSocketServer } from "ws";
import { createServer } from "http";

dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const logger = new EvalLogger(wss);

app.use(express.json());

wss.on("connection", (ws) => {
  console.log("Client connected");
  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

function checkOpenAIKey() {
  try {
    new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });
    return true;
  } catch (e) {
    return false;
  }
}

app.get("/", (req: Request, res: Response) => {
  // Check if OPENAI_API_KEY is set
  res.json({
    success: checkOpenAIKey(),
  });
});

// Hacky way to add an API key to the environment
// TODO: open stagehand PR to parameterize API key on init
app.post("/addApiKey", async (req: Request, res: Response) => {
  const { apiKey } = req.body;
  process.env.OPENAI_API_KEY = apiKey;

  res.json({ success: checkOpenAIKey() });
});

app.post("/goto", async (req: Request, res: Response) => {
  const { requestId, sessionId, url, apiKey, projectId } = req.body;
  logger.broadcastLog("goto", requestId, { url, sessionId });
  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    apiKey,
    projectId,
    browserbaseResumeSessionID: sessionId,
    logger: (message: { category?: string; message: string }) => {
      logger.log(message.message);
    },
  });
  logger.init(stagehand);
  await stagehand.init();
  await stagehand.page.goto(url);
  res.json({ message: "Done" });
});

app.post("/act", async (req: Request, res: Response) => {
  const { requestId, sessionId, apiKey, projectId } = req.body;
  const { actionType, instruction, modelName, useVision }: Action = req.body;
  logger.broadcastLog("act", requestId, {
    actionType,
    instruction,
    modelName,
    useVision,
    sessionId,
  });
  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    apiKey,
    projectId,
    browserbaseResumeSessionID: sessionId,
    logger: (message: { category?: string; message: string }) => {
      logger.log(message.message);
    },
  });
  logger.init(stagehand);
  await stagehand.init();
  await stagehand.act({
    action: instruction,
    modelName,
    useVision,
  });
  res.json({ message: "Done" });
});

type FieldType = "string" | "number" | "boolean" | "object";

interface SchemaField {
  id: string;
  name: string;
  type: FieldType;
  isOptional: boolean;
  isArray: boolean;
  children?: SchemaField[];
}

const generateZodSchema = (fields: SchemaField[]): z.ZodObject<any> => {
  const schemaObject: Record<string, z.ZodTypeAny> = {};

  fields.forEach((field) => {
    let fieldSchema: z.ZodTypeAny;

    switch (field.type) {
      case "string":
        fieldSchema = z.string();
        break;
      case "number":
        fieldSchema = z.number();
        break;
      case "boolean":
        fieldSchema = z.boolean();
        break;
      case "object":
        fieldSchema = field.children
          ? generateZodSchema(field.children)
          : z.object({});
        break;
      default:
        fieldSchema = z.any();
    }

    if (field.isArray) {
      fieldSchema = fieldSchema.array();
    }
    if (field.isOptional) {
      fieldSchema = fieldSchema.optional();
    }

    schemaObject[field.name] = fieldSchema;
  });

  return z.object(schemaObject) as z.ZodObject<any>;
};

app.post("/extract", async (req: Request, res: Response) => {
  const { requestId, sessionId } = req.body;
  const {
    instruction,
    modelName,
    schema: schemaFields,
    apiKey,
    projectId,
  } = req.body;
  logger.broadcastLog("extract", requestId, {
    instruction,
    modelName,
    schemaFields,
  });

  const schema = generateZodSchema(schemaFields);

  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    apiKey,
    projectId,
    browserbaseResumeSessionID: sessionId,
    logger: (message: { category?: string; message: string }) => {
      logger.log(message.message, requestId);
    },
  });
  logger.init(stagehand);
  console.log("schema", JSON.stringify(schema));

  await stagehand.init();
  const result = await stagehand.extract({
    instruction,
    modelName,
    schema,
  });

  res.json(result);
});

app.post("/observe", async (req: Request, res: Response) => {
  const {
    requestId,
    sessionId,
    instruction,
    modelName,
    domSettleTimeoutMs,
    apiKey,
    projectId,
  } = req.body;
  logger.broadcastLog("observe", requestId, {
    sessionId,
    instruction,
    modelName,
    domSettleTimeoutMs,
  });
  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    apiKey,
    projectId,
    browserbaseResumeSessionID: sessionId,
    logger: (message: { category?: string; message: string }) => {
      logger.log(message.message, requestId);
    },
  });
  logger.init(stagehand);
  await stagehand.init();
  const result = await stagehand.observe({
    instruction,
    modelName,
    domSettleTimeoutMs,
  });
  res.json(result);
});

server.listen(6969, () => {
  console.log("Server listening on port 6969");
});
