import { useGT } from "gt-react";
import { createContext, type ReactNode, type RefObject } from "react";
import { useStableCallback } from "~/hooks/useStableCallback";
import { toastManager } from "../../ui/toast";
import type { ChatComposerHandle } from "../ChatComposer";
import type { MarkdownChoiceDraftUpdate } from "./markdownChoiceDraft";

export interface MarkdownChatHandlers {
  onChoiceDraftUpdate?: ((update: MarkdownChoiceDraftUpdate) => boolean) | undefined;
  onSendAppMessage?: ((text: string) => Promise<void>) | undefined;
}

// Only ChatView's own timeline provides handlers; read-only timelines render with none.
export const MarkdownChatHandlersContext = createContext<MarkdownChatHandlers>({});

export function MarkdownChatHandlersProvider({
  composerRef,
  onSendAppMessage,
  children,
}: {
  composerRef: RefObject<ChatComposerHandle | null>;
  onSendAppMessage: ((text: string) => Promise<void>) | undefined;
  children: ReactNode;
}) {
  const gt = useGT();
  const onChoiceDraftUpdate = useStableCallback((update: MarkdownChoiceDraftUpdate) => {
    const queued = composerRef.current?.updateChoiceDraft(update) ?? false;
    if (!queued) {
      toastManager.add({
        type: "warning",
        title: gt("The composer is not ready"),
        description: gt(
          "Try selecting the choice after the connection or pending input is resolved.",
        ),
      });
    }
    return queued;
  });
  return (
    <MarkdownChatHandlersContext value={{ onChoiceDraftUpdate, onSendAppMessage }}>
      {children}
    </MarkdownChatHandlersContext>
  );
}
