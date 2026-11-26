import type { EnvironmentId, MessageId, ThreadId } from "@t3tools/contracts";
import type { TimelineEntry } from "../../../session-logic";
import { choiceRows } from "./markdownChoiceDraft";

export type MarkdownAnswer = { picked: ReadonlySet<string> };

/** Assistant messages followed by a user message, with the actions the replies before the next assistant message picked. */
export function deriveMarkdownAnswers(
  entries: ReadonlyArray<TimelineEntry>,
  thread: { environmentId: EnvironmentId; threadId: ThreadId },
) {
  const answers = new Map<MessageId, { picked: Set<string> }>();
  let current: { id: MessageId; picked: Set<string> } | null = null;
  // Assistant messages after the last user message are unanswered.
  let pending: MessageId[] = [];
  for (const entry of entries) {
    if (entry.kind !== "message") continue;
    const { message } = entry;
    if (message.role === "assistant") {
      current = { id: message.id, picked: new Set() };
      pending.push(message.id);
      answers.set(message.id, current);
    } else if (message.role === "user") {
      pending = [];
      if (current && message.text.includes("Selected "))
        for (const row of choiceRows(message.text, { ...thread, messageId: current.id }))
          if (row.selected) current.picked.add(row.key);
    }
  }
  for (const id of pending) answers.delete(id);
  return answers as ReadonlyMap<MessageId, MarkdownAnswer>;
}
