import type { RefObject } from "react";
import { updateMarkdownChoiceDraft, type MarkdownChoiceDraftUpdate } from "./markdownChoiceDraft";

/** Applies a choice update to the composer prompt; false when the composer cannot take it now. */
export function updateComposerChoiceDraft({
  update,
  environmentId,
  threadId,
  blocked,
  promptRef,
  replacePrompt,
}: {
  update: MarkdownChoiceDraftUpdate;
  environmentId: string;
  threadId: string | null;
  blocked: boolean;
  promptRef: RefObject<string>;
  replacePrompt: (
    start: number,
    end: number,
    replacement: string,
    options: { expectedText: string; focusEditorAfterReplace: boolean },
  ) => boolean;
}): boolean {
  if (update.source.environmentId !== environmentId || update.source.threadId !== threadId)
    return false;
  if (blocked) return false;
  const current = promptRef.current;
  const next = updateMarkdownChoiceDraft(current, update);
  return (
    next === current ||
    replacePrompt(0, current.length, next, {
      expectedText: current,
      focusEditorAfterReplace: false,
    })
  );
}
