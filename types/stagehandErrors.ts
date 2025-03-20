export class StagehandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class StagehandEnvironmentError extends StagehandError {
  constructor(
    currentEnvironment: string,
    requiredEnvironment: string,
    feature: string,
  ) {
    super(
      `You seem to be setting the current environment to ${currentEnvironment}.` +
        `Ensure the environment is set to ${requiredEnvironment} if you want to use ${feature}.`,
    );
  }
}

export class MissingEnvironmentVariableError extends StagehandError {
  constructor(missingEnvironmentVariable: string, feature: string) {
    super(
      `${missingEnvironmentVariable} is required to use ${feature}.` +
        `Please set ${missingEnvironmentVariable} in your environment.`,
    );
  }
}

export class UnsupportedModelError extends StagehandError {
  constructor(supportedModels: string[], feature: string) {
    super(
      `${feature} requires one of the following models: ${supportedModels}`,
    );
  }
}

export class StagehandNotInitializedError extends StagehandError {
  constructor(prop: string) {
    super(
      `You seem to be calling \`${prop}\` on a page in an uninitialized \`Stagehand\` object. ` +
        `Ensure you are running \`await stagehand.init()\` on the Stagehand object before ` +
        `referencing the \`page\` object.`,
    );
  }
}

export class BrowserbaseSessionNotFoundError extends StagehandError {
  constructor() {
    super("No Browserbase session ID found");
  }
}

export class CaptchaTimeoutError extends StagehandError {
  constructor() {
    super("Captcha timeout");
  }
}

export class MissingLLMConfigurationError extends StagehandError {
  constructor() {
    super(
      "No LLM API key or LLM Client configured. An LLM API key or a custom LLM Client " +
        "is required to use act, extract, or observe.",
    );
  }
}

export class HandlerNotInitializedError extends StagehandError {
  constructor(handlerType: string) {
    super(`${handlerType} handler not initialized`);
  }
}

export class StagehandNotImplementedError extends StagehandError {
  constructor(message: string) {
    super(`NotImplementedError: ${message}`);
  }
}

export class StagehandDeprecationError extends StagehandError {
  constructor(message: string) {
    super(`DeprecationError: ${message}`);
  }
}
