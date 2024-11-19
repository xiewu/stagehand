import {
  actionsAtom,
  activeActionAtom,
  credsAtom,
  loadingAtom,
  sessionAtom,
} from "@/app/atoms";
import { SchemaContext, ZodSchemaBuilder } from "../zod-schema-builder";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { executeAction } from "@/lib/bbActions";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { Extract, SchemaField, StagehandAction } from "@/lib/stagehandActions";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import ReactJson from "react18-json-view";
import { DialogClose } from "@radix-ui/react-dialog";

export function ExtractBlock({ actionIndex }: { actionIndex: number }) {
  const session = useAtomValue(sessionAtom);
  const creds = useAtomValue(credsAtom);
  const [actions, setActions] = useAtom(actionsAtom);
  const [loading, setLoading] = useAtom(loadingAtom);
  const [activeAction, setActiveAction] = useAtom(activeActionAtom);
  const inputRef = useRef<HTMLInputElement>(null);
  const action: Extract = actions[actionIndex] as Extract;
  const [schema, setSchema] = useState<SchemaField[]>(action?.schema || []);
  const [zodSchema, setZodSchema] = useState<string | null>(
    action?.zodSchema || null
  );
  const [extractResults, setExtractResults] = useState<null | Record<
    string,
    unknown
  >>(null);

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
        .then((results) =>
          setExtractResults(results as Record<string, unknown>)
        )
        .then(() => setLoading(false));
    },
    [action, session, setExtractResults, setLoading, creds]
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

  useEffect(() => {
    if (action?.schema && schema !== action.schema) {
      setActions(
        actions.map((a, i) =>
          i === actionIndex
            ? {
                ...a,
                schema,
                zodSchema:
                  zodSchema ||
                  `
					z.object({
							object: z.object({
								title: z.string(),
								link: z.string()
							}).array()
						});
				`,
              }
            : a
        )
      );
    }
  }, [schema, action, actions, setActions, actionIndex, zodSchema]);

  if (!session || !action) return null;
  return (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Extract</CardTitle>
        <CardDescription>Extract data from the current page</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
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
              </div>
            </div>
          </form>
          <SchemaContext.Provider
            value={{ schema, setSchema, zodSchema, setZodSchema }}
          >
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Edit Extraction Schema</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[calc(100vh-100px)] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Extract Schema</DialogTitle>
                  <DialogDescription>
                    Make changes to your extract schema here. Click save when
                    you&apos;re done.
                  </DialogDescription>
                </DialogHeader>
                <ZodSchemaBuilder />
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="submit">Close</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </SchemaContext.Provider>
        </div>
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button onClick={() => execute()} disabled={loading}>
          Execute
        </Button>
        {extractResults && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">View Extract Results</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[calc(100vh-100px)] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>View Extract Results</DialogTitle>
                <DialogDescription>
                  Examine what was returned from the extract action
                </DialogDescription>
              </DialogHeader>
              <ReactJson src={extractResults} />
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="submit">Close</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardFooter>
    </Card>
  );
}
