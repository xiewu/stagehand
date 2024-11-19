import { WebSocketServer } from "ws";
import { Stagehand } from "../../lib";

export class EvalLogger {
  logs: string[] = [];
  stagehand?: Stagehand;
  wss: WebSocketServer;

  constructor(wss: WebSocketServer) {
    this.wss = wss;
  }

  broadcastLog(message: string, requestId?: string, data?: any) {
    if (message.includes("Browserbase session")) {
      return;
    }
    const logMessage = JSON.stringify({
      requestId,
      message,
      data,
      timestamp: new Date().toISOString(),
    });

    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(logMessage);
      }
    });
    console.log(message, data);
  }

  init(stagehand: Stagehand) {
    this.stagehand = stagehand;
  }

  log(message: string, requestId?: string) {
    this.broadcastLog(message, requestId);
    this.logs.push(message);
  }

  error(message: string, requestId?: string) {
    this.broadcastLog(message, requestId);
    this.logs.push(`Error: ${message}`);
    // if (this.stagehand) {
    //   this.stagehand.page
    //     .evaluate((message: string) => console.error(message), message)
    //     .catch(() => {});
    // }
  }

  warn(message: string, requestId?: string) {
    this.broadcastLog(message, requestId);
    this.logs.push(`Warning: ${message}`);
    // if (this.stagehand) {
    //   this.stagehand.page
    //     .evaluate((message: string) => console.warn(message), message)
    //     .catch(() => {});
    // }
  }

  getLogs() {
    return this.logs;
  }
}
