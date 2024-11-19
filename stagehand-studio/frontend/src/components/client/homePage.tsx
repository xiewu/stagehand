"use client";

import {
  actionsAtom,
  sessionAtom,
  activeActionAtom,
  credsAtom,
} from "@/app/atoms";
import { zodResolver } from "@hookform/resolvers/zod";
import { createSession, getDebugUrl } from "@/lib/bbActions";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { ActBlock } from "./stagehandActions/act";
import { NavigateBlock } from "./stagehandActions/navigate";
import { ExtractBlock } from "./stagehandActions/extract";
import { CommandBar } from "./commandBar";
import { genScript, StagehandAction } from "@/lib/stagehandActions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { SquareArrowUpRight } from "lucide-react";
import SyntaxHighlighter from "react-syntax-highlighter";
import { docco } from "react-syntax-highlighter/dist/esm/styles/hljs";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { LogViewer } from "./logViewer";

const formSchema = z.object({
  apiKey: z.string().min(2, {
    message: "Browserbase API Key must be at least 2 characters.",
  }),
  projectId: z.string().uuid({
    message: "Project ID must be a valid UUID.",
  }),
  openaiApiKey: z.string().min(2, {
    message: "OpenAI API Key must be at least 2 characters.",
  }),
});

function Codeblocks() {
  const session = useAtomValue(sessionAtom);
  const actions = useAtomValue(actionsAtom);
  const [activeAction, setActiveAction] = useAtom(activeActionAtom);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (activeAction === null) {
          setActiveAction(0);
        } else if (activeAction < actions.length - 1) {
          setActiveAction(activeAction + 1);
        }
      }
      if (e.key === "ArrowUp" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (activeAction === null || activeAction === 0) return;
        setActiveAction(activeAction - 1);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [activeAction, setActiveAction, actions]);

  const actionComponent = (action: StagehandAction, index: number) => {
    if (action.actionType === "navigate")
      return <NavigateBlock actionIndex={index} />;
    if (action.actionType === "action") return <ActBlock actionIndex={index} />;
    if (action.actionType === "extract")
      return <ExtractBlock actionIndex={index} />;
    return null;
  };

  if (!session) return null;
  return (
    <div className="flex-grow max-w-[400px] py-8 h-full overflow-y-auto flex justify-center bg-white">
      <div className="flex flex-col gap-2 items-center justify-end">
        <div className="flex gap-2">
          <Link href={`https://browserbase.com/sessions/${session.id}`}>
            <Button variant="outline">
              Examine Session <SquareArrowUpRight className="w-4 h-4" />
            </Button>
          </Link>
          {actions.length > 0 && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Generate script</Button>
              </DialogTrigger>
              <DialogContent className="w-fit overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Generate script</DialogTitle>
                </DialogHeader>
                <DialogDescription>
                  <SyntaxHighlighter language="typescript" style={docco}>
                    {genScript(actions)}
                  </SyntaxHighlighter>
                </DialogDescription>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <CommandBar />
        <div className="flex flex-col gap-2 py-2">
          {actions.map((a, i) => (
            <div
              className={
                activeAction === i
                  ? "border-2 border-blue-500 rounded-xl w-fit"
                  : ""
              }
              key={i}
            >
              {actionComponent(a, i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Browser() {
  const session = useAtomValue(sessionAtom);
  const creds = useAtomValue(credsAtom);
  const [debugUrl, setDebugUrl] = useState<string | null>(null);
  console.log(session);

  useEffect(() => {
    if (!session) return;
    getDebugUrl(session.id, creds.apiKey).then(setDebugUrl);
  }, [session, creds]);

  if (!debugUrl) return null;
  return (
    <div className="flex-grow h-full bg-gray-500">
      <iframe className="w-full h-full" src={debugUrl} />
    </div>
  );
}

function CredsForm({ sessionError }: { sessionError: string | null }) {
  const [creds, setCreds] = useAtom(credsAtom);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      apiKey: creds.apiKey,
      projectId: creds.projectId,
      openaiApiKey: creds.openaiApiKey,
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    setCreds(values);
    console.log("onSubmit", values);
  }

  return (
    <div className="h-full w-full flex items-center justify-center">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">Welcome to Stagehand Studio!</h1>
          <p className="text-sm text-gray-500">
            Enter your Browserbase credentials to get started. You can find
            these on the{" "}
            <Link
              className="underline text-blue-500"
              href="https://browserbase.com/settings"
            >
              Browserbase settings page
            </Link>
            .
          </p>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="projectId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Browserbase Project ID</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="asd************************"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    This is your Browserbase project ID.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="apiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Browserbase API Key</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="bb_live_asd************************"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    This is your Browserbase API key.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <p className="text-sm text-gray-500">
              We also use OpenAI to generate scripts, so you&apos;ll need an
              OpenAI API key. You can find this on the{" "}
              <Link
                className="underline text-blue-500"
                href="https://platform.openai.com/api-keys"
              >
                OpenAI API keys page
              </Link>
              .
            </p>
            <FormField
              control={form.control}
              name="openaiApiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>OpenAI API Key</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="sk-proj-asd************************"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    This is your OpenAI API key.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit">Submit</Button>
            {sessionError && (
              <div className="flex items-center justify-center">
                <div className="flex flex-col gap-2 bg-red-50 rounded-lg p-8 max-w-lg">
                  <h1 className="text-2xl font-bold">Error creating session</h1>
                  <SyntaxHighlighter
                    language="typescript"
                    style={docco}
                    className="my-8"
                  >
                    {sessionError}
                  </SyntaxHighlighter>
                  <p className="text-sm text-gray-800">
                    This is likely due to an invalid Browserbase API key,
                    project ID, or an unset/invalid OpenAI API key.
                  </p>
                  <p className="text-sm text-gray-800">
                    To remedy this, please double-check your Browserbase
                    credentials and make sure the <code>OPENAI_API_KEY</code>{" "}
                    environment variable is set in the <code>backend/.env</code>{" "}
                    file.
                  </p>
                  <p className="text-sm text-gray-800">
                    Be sure to refer to our{" "}
                    <Link
                      className="underline text-blue-500"
                      href="https://github.com/browserbase/stagehand-studio?tab=readme-ov-file#quickstart"
                    >
                      quickstart
                    </Link>{" "}
                    for more information.
                  </p>
                  <p className="text-sm text-gray-800">
                    Once complete, restart the project by running{" "}
                    <code>npm run dev</code> in the{" "}
                    <code>stagehand-studio</code> root directory
                  </p>
                </div>
              </div>
            )}
          </form>
        </Form>
      </div>
    </div>
  );
}

export default function HomePage() {
  const setSession = useSetAtom(sessionAtom);
  const creds = useAtomValue(credsAtom);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const initSession = useCallback(async () => {
    try {
      console.log("initSession", creds);
      const response = await createSession({
        apiKey: creds.apiKey,
        projectId: creds.projectId,
        openaiApiKey: creds.openaiApiKey,
      });
      setSession(response);
    } catch (e) {
      setSessionError((e as Error).message);
    }
  }, [creds, setSession, setSessionError]);
  useEffect(() => {
    if (!creds.apiKey || !creds.projectId) return;
    setSessionError(null);
    initSession();
  }, [creds, initSession]);
  if (!creds.apiKey || !creds.projectId || sessionError) {
    return <CredsForm sessionError={sessionError} />;
  }
  return (
    <div className="w-screen h-screen overflow-hidden flex">
      <Codeblocks />
      <Browser />
      <LogViewer />
    </div>
  );
}
