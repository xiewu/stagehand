"use client";

import { Bot, BrainCircuit, Globe } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  actionsAtom,
  activeActionAtom,
  loadingAtom,
  observeResultsAtom,
} from "@/app/atoms";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { StagehandAction } from "@/lib/stagehandActions";
import { useState } from "react";
import { useEffect } from "react";
import { Button } from "../ui/button";
import { v4 as uuidv4 } from "uuid";
export function CommandBar() {
  const [open, setOpen] = useState(false);
  const observeResults = useAtomValue(observeResultsAtom);
  const [actions, setActions] = useAtom(actionsAtom);
  const setActiveAction = useSetAtom(activeActionAtom);
  const [actionToAdd, setActionToAdd] = useState<StagehandAction | null>(null);
  const loading = useAtomValue(loadingAtom);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!loading && e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [loading]);

  useEffect(() => {
    if (actionToAdd) {
      setOpen(false);
      const l = actions.length;
      setActions([...actions, actionToAdd]);
      setActiveAction(l);
      setActionToAdd(null);
    }
  }, [actionToAdd, setActions, setActiveAction, setOpen, actions]);

  useEffect(() => {
    if (!open && actions.length === 0) {
      setOpen(true);
    }
  }, [actions, open, setOpen]);

  return (
    <>
      {!loading && (
        <div className="flex flex-col gap-2 items-center justify-end">
          <Button onClick={() => setOpen(true)}>Add Command</Button>
          <p className="text-sm text-muted-foreground">
            Press{" "}
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
              <span className="text-xs">⌘</span>K
            </kbd>{" "}
            to open the command bar
          </p>
        </div>
      )}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          <CommandGroup heading="Commands">
            <CommandItem
              onSelect={() => {
                setActionToAdd({
                  requestId: uuidv4(),
                  actionType: "navigate",
                  url: "https://news.ycombinator.com",
                });
              }}
            >
              <Globe />
              <span>Navigate</span>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setActionToAdd({
                  requestId: uuidv4(),
                  actionType: "action",
                  instruction: "Click the button",
                  modelName: "gpt-4o",
                  useVision: "fallback",
                });
              }}
            >
              <Bot />
              <span>Act</span>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setActionToAdd({
                  requestId: uuidv4(),
                  actionType: "extract",
                  instruction: "Extract the first five result titles and urls",
                  modelName: "gpt-4o",
                  zodSchema: `z.object({
					results: z.object({
						title: z.string(),
						link: z.string()
                      })
                      .array(),
                  	});
                	`,
                  schema: [
                    {
                      id: "results",
                      name: "results",
                      type: "object",
                      isOptional: false,
                      isArray: true,
                      children: [
                        {
                          id: "title",
                          name: "title",
                          type: "string",
                          isOptional: false,
                          isArray: false,
                        },
                        {
                          id: "link",
                          name: "link",
                          type: "string",
                          isOptional: false,
                          isArray: false,
                        },
                      ],
                    },
                  ],
                });
              }}
            >
              <BrainCircuit />
              <span>Extract</span>
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Suggestions">
            {observeResults.length > 0 && (
              <>
                {observeResults.map((result, i) => (
                  <CommandItem
                    onSelect={() => {
                      setActionToAdd({
                        requestId: uuidv4(),
                        actionType: "action",
                        instruction: result.description,
                        modelName: "gpt-4o",
                        useVision: "fallback",
                      });
                    }}
                    key={i}
                  >
                    <Bot />
                    <span>{result.description}</span>
                  </CommandItem>
                ))}
              </>
            )}
            {[
              {
                name: "Google",
                url: "https://google.com",
              },
              {
                name: "Hacker News",
                url: "https://news.ycombinator.com",
              },
            ].map((s, i) => (
              <CommandItem
                onSelect={() => {
                  setActionToAdd({
                    requestId: uuidv4(),
                    actionType: "navigate",
                    url: s.url,
                  });
                }}
                key={i}
              >
                <Globe />
                <span>Navigate to {s.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
        </CommandList>
      </CommandDialog>
    </>
  );
}
