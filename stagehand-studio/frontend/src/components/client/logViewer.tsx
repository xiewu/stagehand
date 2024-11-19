"use client";
import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { logFilterRequestIdAtom } from "@/app/atoms";

interface Log {
  message: string;
  requestId?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

export function LogViewer() {
  const filterRequestId = useAtomValue(logFilterRequestIdAtom);
  const [logs, setLogs] = useState<Log[]>([]);

  useEffect(() => {
    const websocket = new WebSocket("ws://localhost:6969");

    websocket.onmessage = (event) => {
      const log = JSON.parse(event.data) as Log;
      setLogs((prev) => [...prev, log]);
    };

    websocket.onclose = () => {
      console.log("WebSocket connection closed");
    };

    return () => {
      websocket.close();
    };
  }, []);

  return (
    <div className="p-4 max-w-[500px] overflow-y-auto">
      {logs.length > 0 && <h3 className="text-sm font-mono mb-2">Logs</h3>}
      <div className=" flex flex-col gap-4">
        {logs
          .filter(
            (log) => !filterRequestId || log.requestId === filterRequestId,
          )
          .map((log, i) => (
            <div
              key={i}
              onClick={(e) => {
                const target = e.currentTarget;
                if (target.style.height === "auto") {
                  target.style.height = "100px";
                } else {
                  target.style.height = "auto";
                }
              }}
              className="text-xs font-mono h-[100px] overflow-hidden border border-gray-400 rounded-md cursor-pointer transition-[height] duration-200"
            >
              <div className="m-4">
                <span className="text-gray-400">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className="mx-2">-</span>
                <span>{log.message}</span>
                {log.data && (
                  <span className="text-gray-400">
                    {" "}
                    {JSON.stringify(log.data)}
                  </span>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
