import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { serializeAssistantCitation } from "@t3tools/shared/assistantCitations";
import { describe, expect, it } from "vite-plus/test";
import { collectNextMessages, resolveOpenNextEntries, type NextMessage } from "./composerNextItems";

const thread = { environmentId: EnvironmentId.make("env"), threadId: ThreadId.make("thread") };
const fence = (items: object[]) => `Done\n\n\`\`\`next\n${JSON.stringify({ items })}\n\`\`\``;
const ask = (text: string, group?: string) => ({
  type: "approve",
  ask: text,
  ...(group ? { actions: [{ label: "Go", choice: `${group}/go` }] } : {}),
});
const assistant = (id: string, items: object[], streaming = false) =>
  ({
    item: {
      type: "assistant_message",
      id,
      messageId: `m-${id}`,
      streaming,
      text: fence(items),
    },
  }) as never;
const user = (id: string, text = "unrelated") =>
  ({ item: { type: "user_message", id, messageId: id, text } }) as never;
const sent = (id: string, group: string) =>
  user(
    id,
    `Selected ${group}/go: ${serializeAssistantCitation({
      version: 1,
      ...thread,
      messageId: `m-${id.replace("u", "a")}` as never,
      text: "Go",
      start: 0,
      end: 2,
      prefix: "",
      suffix: "",
    })}`,
  );
const messagesOf = (rows: never[]) =>
  collectNextMessages(rows.map((row) => ({ ...(row as object) })) as never, new Map());
const resolve = (rows: never[], dismissed: string[] = []) =>
  resolveOpenNextEntries(rows, messagesOf(rows), new Set(dismissed), thread).map(
    ({ item }) => item.ask,
  );

describe("resolveOpenNextEntries", () => {
  it("keeps an unanswered older item open beside the newest, newest first", () => {
    const rows = [
      assistant("a1", [ask("approve plan", "plan")]),
      user("u1"),
      assistant("a2", [ask("start T2?", "t2"), ask("second", "second")]),
    ];
    expect(resolve(rows)).toEqual(["start T2?", "second", "approve plan"]);
  });

  it.each<[string, unknown[], string[], string[]?]>([
    ["a sent choice", [assistant("a1", [ask("q", "g")]), sent("u1", "g")], []],
    [
      "a later fence with the same choice group",
      [assistant("a1", [ask("old", "g")]), assistant("a2", [ask("new", "g")])],
      ["new"],
    ],
    [
      "a later fence with the same ask",
      [assistant("a1", [ask("same", "x")]), assistant("a2", [ask("same", "y")])],
      ["same"],
    ],
    ["a dismissal", [assistant("a1", [ask("q", "g")])], [], ["m-a1:0"]],
    [
      "a later user message for an action-less item",
      [assistant("a1", [ask("fyi")]), user("u1")],
      [],
    ],
  ])("closes on %s", (_name, rows, expected, dismissed = []) => {
    expect(resolve([...rows] as never, [...dismissed])).toEqual(expected);
  });

  it("keeps an item with actions open after an unrelated user message", () => {
    expect(resolve([assistant("a1", [ask("q", "g")]), user("u1")])).toEqual(["q"]);
  });

  it("hides everything while the latest assistant message streams", () => {
    const rows = [assistant("a1", [ask("q", "g")]), user("u1"), assistant("a2", [], true)];
    expect(resolve(rows)).toEqual([]);
  });
});

describe("collectNextMessages", () => {
  it("skips streaming messages, reuses parsed messages and bounds the look-back", () => {
    const rows = [assistant("a1", [ask("q", "g")]), assistant("a2", [ask("p", "h")], true)];
    const cache = new Map();
    const first = collectNextMessages(rows as never, cache);
    expect(first.map((message: NextMessage) => message.id)).toEqual(["a1"]);
    expect(collectNextMessages(rows as never, cache)[0]).toBe(first[0]);
    const many = [
      assistant("old", [ask("q", "g")]),
      ...Array.from({ length: 30 }, (_, i) => ({
        item: {
          type: "assistant_message",
          id: `p${i}`,
          messageId: `p${i}`,
          streaming: false,
          text: "x",
        },
      })),
    ];
    expect(collectNextMessages(many as never, new Map())).toEqual([]);
  });
});
