import { ObserveResult, StagehandAction } from "@/lib/stagehandActions";
import type { SessionCreateResponse } from "@browserbasehq/sdk/resources/index.js";
import { atomWithStorage } from "jotai/utils";
import { atom } from "jotai";

export const sessionAtom = atom<SessionCreateResponse | null>(null);
export const actionsAtom = atom<StagehandAction[]>([]);
export const observeResultsAtom = atom<ObserveResult[]>([]);
export const loadingAtom = atom<boolean>(false);
export const activeActionAtom = atom<number | null>(null);
// TODO: find a better way to store these
export const credsAtom = atomWithStorage<{
  apiKey: string;
  projectId: string;
  openaiApiKey: string;
}>("creds", {
  apiKey: "",
  projectId: "",
  openaiApiKey: "",
});

export const logFilterRequestIdAtom = atom<string | null>(null);
