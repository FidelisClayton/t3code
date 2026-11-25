import { describe, expect, it } from "vite-plus/test";
import { findLastMarkdownNext, parseMarkdownNext } from "./markdownNext";

const item = {
  type: "approve",
  ask: "Push [#1920](https://example.com).",
  details: "Body",
  danger: false,
  actions: [
    { label: "Push", choice: "push-1920/push", primary: true },
    { label: "Edit", choice: "push-1920/edit" },
  ],
};
const parse = (value: unknown) => parseMarkdownNext(JSON.stringify(value));

describe("Markdown next", () => {
  it("accepts a card and rejects invalid ones", () => {
    expect(parse({ items: [item] })?.items[0]?.actions).toHaveLength(2);
    expect(parse({ items: [{ type: "ask", ask: "x" }] })).toBeNull();
    expect(parse({ items: [{ ...item, ask: " " }] })).toBeNull();
    expect(parse({ items: [] })).toBeNull();
    expect(
      parse({
        items: [
          {
            ...item,
            actions: item.actions.map((action) => ({ ...action, primary: true })),
          },
        ],
      }),
    ).toBeNull();
    expect(
      parse({ items: [{ ...item, actions: [{ label: "Push", choice: "no-slash" }] }] }),
    ).toBeNull();
    expect(parse({ items: [{ ...item, extra: 1 }] })).toBeNull();
    expect(parse({ items: [{ ...item, details: "x".repeat(32769) }] })).toBeNull();
    expect(parse({ items: Array.from({ length: 9 }, () => item) })).toBeNull();
    expect(parseMarkdownNext("x".repeat(262145))).toBeNull();
  });
});

describe("findLastMarkdownNext", () => {
  const fence = (value: unknown) => "```next\n" + JSON.stringify(value) + "\n```";
  it("returns the last fence, or null when invalid or absent", () => {
    const text = (value: unknown) =>
      `before\n${fence({ items: [{ ...item, ask: "first" }] })}\nmid\n${fence(value)}\nafter`;
    expect(findLastMarkdownNext(text({ items: [{ ...item, ask: "last" }] }))?.items[0]?.ask).toBe(
      "last",
    );
    expect(findLastMarkdownNext(text({ items: [{ type: "ask", ask: "x" }] }))).toBeNull();
    expect(findLastMarkdownNext("no fence here")).toBeNull();
  });
});
