export type AvailableModel =
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gpt-4o-2024-08-06"
  | "claude-3-5-sonnet-latest"
  | "claude-3-5-sonnet-20241022"
  | "claude-3-5-sonnet-20240620";

export type Action = {
  requestId: string;
  actionType: "action";
  instruction: string;
  modelName?: AvailableModel;
  useVision?: "fallback" | boolean;
};

export type FieldType = "string" | "number" | "boolean" | "object";

export interface SchemaField {
  id: string;
  name: string;
  type: FieldType;
  isOptional: boolean;
  isArray: boolean;
  children?: SchemaField[];
}

export type Extract = {
  requestId: string;
  actionType: "extract";
  instruction: string;
  schema: SchemaField[];
  zodSchema: string;
  modelName?: AvailableModel;
};

export type Navigate = {
  requestId: string;
  actionType: "navigate";
  url: string;
};

export type Observe = {
  requestId: string;
  actionType: "observe";
  instruction: string;
  modelName?: AvailableModel;
  domSettleTimeoutMs?: number;
};

export type ObserveResult = {
  description: string;
  selector: string;
};

export type StagehandAction = Action | Extract | Navigate | Observe;

export function toString(action: StagehandAction): string {
  if (action.actionType === "extract") {
    return `
		schema = ${action.zodSchema}
		await stagehand.extract({
			instruction: "${action.instruction}",
			modelName: "${action.modelName}",
			schema: schema,
		});`;
  }
  if (action.actionType === "navigate") {
    return `await stagehand.page.goto("${action.url}");`;
  }
  if (action.actionType === "action") {
    return `await stagehand.act({
			action: "${action.instruction}",
			modelName: "${action.modelName}",
			useVision: "${action.useVision}",
		});`;
  }
  return "";
}

export function genScript(actions: StagehandAction[]): string {
  return `
	import { Stagehand } from "@browserbasehq/stagehand";
	import { Browserbase } from "@browserbasehq/sdk";

	const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY!;
	const BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID!;
	
	const bb = new Browserbase({
  		apiKey: BROWSERBASE_API_KEY,
	});

	async function main() {
		let schema;
		const session = await bb.sessions.create({
			projectId: BROWSERBASE_PROJECT_ID,
		});
		const stagehand = new Stagehand({
			env: "BROWSERBASE",
			browserbaseResumeSessionID: session.id,
			apiKey: BROWSERBASE_API_KEY,
			projectId: BROWSERBASE_PROJECT_ID,
		});
		await stagehand.init();
		${actions.map(toString).join("\n\t\t")}
	}

	main().catch(console.error);
  `;
}
