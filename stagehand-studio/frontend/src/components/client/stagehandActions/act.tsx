"use client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { executeAction } from "@/lib/bbActions";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  actionsAtom,
  observeResultsAtom,
  loadingAtom,
  sessionAtom,
  activeActionAtom,
  credsAtom,
} from "@/app/atoms";
import { Action, ObserveResult, StagehandAction } from "@/lib/stagehandActions";
import { Checkbox } from "@/components/ui/checkbox";
import { useCallback, useEffect, useRef } from "react";

export function ActBlock({ actionIndex }: { actionIndex: number }) {
  const session = useAtomValue(sessionAtom);
  const creds = useAtomValue(credsAtom);
  const [actions, setActions] = useAtom(actionsAtom);
  const setObserveResults = useSetAtom(observeResultsAtom);
  const [loading, setLoading] = useAtom(loadingAtom);
  const [activeAction, setActiveAction] = useAtom(activeActionAtom);
  const inputRef = useRef<HTMLInputElement>(null);
  const action: Action = actions[actionIndex] as Action;

  const execute = useCallback(
    (skipObserve: boolean = false) => {
      if (!session) return;
      setLoading(true);
      executeAction(
        action,
        session.id,
        skipObserve,
        creds.apiKey,
        creds.projectId
      )
        .then((results) => setObserveResults(results as ObserveResult[]))
        .then(() => setLoading(false));
    },
    [action, session, setObserveResults, setLoading, creds]
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        e.key === "i" &&
        (e.metaKey || e.ctrlKey) &&
        activeAction === actionIndex
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    if (activeAction !== actionIndex) {
      inputRef.current?.blur();
      document.removeEventListener("keydown", down);
      return;
    } else {
      inputRef.current?.focus();
    }

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [activeAction, actionIndex]);

  if (!session) return null;
  return (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Act</CardTitle>
        <CardDescription>Act on the current page</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            execute();
          }}
        >
          <div className="grid w-full items-center gap-4">
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="instruction">Instruction</Label>
              <Input
                id="instruction"
                placeholder="Instruction"
                value={action.instruction}
                onChange={(e) =>
                  setActions(
                    actions.map((a: StagehandAction, i: number) =>
                      i === actionIndex
                        ? { ...a, instruction: e.target.value }
                        : a
                    )
                  )
                }
                ref={inputRef}
                onFocus={() => setActiveAction(actionIndex)}
                disabled={loading}
              />
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="useVision"
                  checked={action.useVision === "fallback"}
                  onCheckedChange={(e) => {
                    setActions(
                      actions.map((a) =>
                        a === action
                          ? { ...a, useVision: e ? "fallback" : false }
                          : a
                      )
                    );
                    setActiveAction(actionIndex);
                  }}
                  disabled={loading}
                />
                <label
                  htmlFor="useVision"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Use Vision
                </label>
              </div>
            </div>
          </div>
        </form>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button onClick={() => execute()} disabled={loading}>
          Execute
        </Button>
      </CardFooter>
    </Card>
  );
}
