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
  activeActionAtom,
  credsAtom,
  loadingAtom,
  observeResultsAtom,
  sessionAtom,
} from "@/app/atoms";
import {
  Navigate,
  ObserveResult,
  StagehandAction,
} from "@/lib/stagehandActions";
import { useCallback, useEffect, useRef } from "react";

export function NavigateBlock({ actionIndex }: { actionIndex: number }) {
  const session = useAtomValue(sessionAtom);
  const creds = useAtomValue(credsAtom);
  const [actions, setActions] = useAtom(actionsAtom);
  const [loading, setLoading] = useAtom(loadingAtom);
  const action: Navigate = actions[actionIndex] as Navigate;
  const setObserveResults = useSetAtom(observeResultsAtom);
  const [activeAction, setActiveAction] = useAtom(activeActionAtom);
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
  const inputRef = useRef<HTMLInputElement>(null);

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
        <CardTitle>Goto</CardTitle>
        <CardDescription>Navigate to a URL.</CardDescription>
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
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                placeholder="URL"
                value={action.url}
                onChange={(e) =>
                  setActions(
                    actions.map((a: StagehandAction, i: number) =>
                      i === actionIndex ? { ...a, url: e.target.value } : a
                    )
                  )
                }
                autoFocus
                ref={inputRef}
                onFocus={() => setActiveAction(actionIndex)}
                disabled={loading}
              />
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
