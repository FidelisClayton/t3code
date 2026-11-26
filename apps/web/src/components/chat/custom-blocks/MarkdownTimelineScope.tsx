import type { ScopedThreadRef } from "@t3tools/contracts";
import type { ComponentProps } from "react";
import { MarkdownAnswersContext } from "./MarkdownAnswers";
import { deriveMarkdownAnswers } from "./MarkdownAnswers.logic";
import { MarkdownChatHandlersProvider, type MarkdownChatHandlers } from "./MarkdownChatHandlers";
import { MarkdownReferenceTimelineScope } from "./MarkdownReferenceScope";

/** What ChatView's timeline gives its assistant rows: the conversation's references and the composer handlers. */
export function MarkdownTimelineScope({
  entries,
  threadRef,
  composerRef,
  onSendAppMessage,
  children,
}: ComponentProps<typeof MarkdownReferenceTimelineScope> &
  Pick<ComponentProps<typeof MarkdownChatHandlersProvider>, "composerRef"> &
  Pick<MarkdownChatHandlers, "onSendAppMessage"> & { threadRef: ScopedThreadRef | null }) {
  const answers = threadRef ? deriveMarkdownAnswers(entries, threadRef) : undefined;
  return (
    <MarkdownChatHandlersProvider composerRef={composerRef} onSendAppMessage={onSendAppMessage}>
      <MarkdownReferenceTimelineScope entries={entries}>
        {answers ? (
          <MarkdownAnswersContext value={answers}>{children}</MarkdownAnswersContext>
        ) : (
          children
        )}
      </MarkdownReferenceTimelineScope>
    </MarkdownChatHandlersProvider>
  );
}
