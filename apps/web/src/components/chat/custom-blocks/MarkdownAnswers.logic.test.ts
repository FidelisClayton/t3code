import { EnvironmentId, MessageId, ThreadId, type AssistantCitation } from "@t3tools/contracts";
import { serializeAssistantCitation } from "@t3tools/shared/assistantCitations";
import { expect, it } from "vite-plus/test";
import type { TimelineEntry } from "../../../session-logic";
import { deriveMarkdownAnswers } from "./MarkdownAnswers.logic";

const thread = { environmentId: EnvironmentId.make("env"), threadId: ThreadId.make("thread") };
const entry = (role: "user" | "assistant", id: string, text = "") =>
  ({
    id,
    kind: "message",
    createdAt: "",
    message: { id: MessageId.make(id), role, text },
  }) as unknown as TimelineEntry;
const row = (messageId: string, key: string) => {
  const citation: AssistantCitation = {
    version: 1,
    ...thread,
    messageId: MessageId.make(messageId),
    text: "x",
    start: 0,
    end: 1,
    prefix: "",
    suffix: "",
  };
  return `Selected ${key}: ${serializeAssistantCitation(citation)}`;
};

it("answers only assistant messages followed by a user message", () => {
  const answers = deriveMarkdownAnswers(
    [entry("assistant", "a1"), entry("user", "u1"), entry("assistant", "a2")],
    thread,
  );
  expect([...answers.keys()]).toEqual(["a1"]);
});

it("collects picked keys from rows citing the message, also from later replies", () => {
  const answers = deriveMarkdownAnswers(
    [
      entry("assistant", "a1"),
      entry("user", "u1", `${row("a1", "g/one")}\n${row("other", "g/two")}`),
      entry("assistant", "a2"),
      entry("user", "u2", `${row("a1", "g/late")}\n${row("a2", "h/yes")}`),
    ],
    thread,
  );
  expect([...answers.get(MessageId.make("a1"))!.picked]).toEqual(["g/one", "g/late"]);
  expect([...answers.get(MessageId.make("a2"))!.picked]).toEqual(["h/yes"]);
});

it("attributes a selection to an earlier assistant message it cites", () => {
  const answers = deriveMarkdownAnswers(
    [
      entry("assistant", "a1"),
      entry("user", "u1", "unrelated"),
      entry("assistant", "a2"),
      entry("user", "u2", row("a1", "g/go")),
    ],
    thread,
  );
  expect([...answers.get(MessageId.make("a1"))!.picked]).toEqual(["g/go"]);
});
