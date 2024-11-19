"use client";
import { Button } from "@/components/ui/button";
import { useAtom, useAtomValue } from "jotai";
import { actionsAtom, sessionAtom } from "@/app/atoms";
import { useCallback } from "react";

export function SuggestedActionBlock({
  initialInstruction,
}: {
  initialInstruction: string;
}) {
  const session = useAtomValue(sessionAtom);
  const [actions, setActions] = useAtom(actionsAtom);

  const addAction = useCallback(() => {
    if (!session) return;
    setActions([
      ...actions,
      { actionType: "action", instruction: initialInstruction },
    ]);
  }, [initialInstruction, session, actions, setActions]);

  if (!session) return null;
  return <Button onClick={addAction}>{initialInstruction}</Button>;
}
