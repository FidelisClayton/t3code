import type { MessageId } from "@t3tools/contracts";
import { createContext, use } from "react";
import type { MarkdownAnswer } from "./markdownAnswers";

const NO_ANSWERS: ReadonlyMap<MessageId, MarkdownAnswer> = new Map();
export const MarkdownAnswersContext = createContext(NO_ANSWERS);

/** The picked-action set of an assistant message the user has replied to, else undefined. */
export function useMarkdownAnswer(messageId: MessageId | undefined) {
  const answers = use(MarkdownAnswersContext);
  return messageId ? answers.get(messageId) : undefined;
}

/** The actions a Next card shows as picked; empty outside an answered card. */
export const MarkdownPickedContext = createContext<ReadonlySet<string>>(new Set());
