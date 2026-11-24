import type { ComponentProps } from "react";
import { MarkdownChatHandlersProvider, type MarkdownChatHandlers } from "./MarkdownChatHandlers";
import { MarkdownReferenceTimelineScope } from "./MarkdownReferenceScope";

/** What ChatView's timeline gives its assistant rows: the conversation's references and the composer handlers. */
export function MarkdownTimelineScope({
  entries,
  composerRef,
  onSendAppMessage,
  children,
}: ComponentProps<typeof MarkdownReferenceTimelineScope> &
  Pick<ComponentProps<typeof MarkdownChatHandlersProvider>, "composerRef"> &
  Pick<MarkdownChatHandlers, "onSendAppMessage">) {
  return (
    <MarkdownChatHandlersProvider composerRef={composerRef} onSendAppMessage={onSendAppMessage}>
      <MarkdownReferenceTimelineScope entries={entries}>{children}</MarkdownReferenceTimelineScope>
    </MarkdownChatHandlersProvider>
  );
}
