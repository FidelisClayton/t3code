import { describe, expect, it } from "vite-plus/test";
import { factToneCounts, parseMarkdownFacts } from "./markdownFacts";

const facts = {
  title: "Still open",
  items: [
    {
      title: "Context budget failure",
      brief: "The agent instructions most likely grew past the budget.",
      details: "The limit lives in `agentContextBudget.json`.\n\n- Shorten the instructions",
      tone: "problem",
      icon: "circle-x",
    },
    { title: "No CI pass", brief: "Lint never ran.", tone: "warn", icon: "triangle-alert" },
    { title: "Local review rounds", brief: "No record of the rounds.", tone: "info" },
    { title: "Tooling", brief: "Five pieces depend on the format.", icon: "wrench" },
  ],
};
const parse = (value: unknown) => parseMarkdownFacts(JSON.stringify(value));
const first = facts.items[0]!;

describe("Markdown facts", () => {
  it("accepts titled, toned and iconed items with Markdown details", () => {
    expect(parse(facts)?.items).toHaveLength(4);
    expect(parse({ items: [{ title: "A", brief: "B" }] })).not.toBeNull();
  });
  it("rejects excess keys on the fence and on items", () => {
    expect(parse({ ...facts, extra: 1 })).toBeNull();
    expect(parse({ items: [{ ...first, label: "A" }] })).toBeNull();
  });
  it("rejects icons outside the allowlist and unknown tones", () => {
    expect(parse({ items: [{ ...first, icon: "rocket" }] })).toBeNull();
    expect(parse({ items: [{ ...first, icon: "CircleX" }] })).toBeNull();
    expect(parse({ items: [{ ...first, tone: "neutral" }] })).toBeNull();
  });
  it("rejects empty, oversized and malformed input", () => {
    expect(parse({ items: [] })).toBeNull();
    expect(parse({ title: "Only a title" })).toBeNull();
    expect(parse({ items: Array.from({ length: 13 }, () => first) })).toBeNull();
    expect(parse({ items: [{ ...first, brief: " " }] })).toBeNull();
    expect(parse({ items: [{ ...first, brief: "x".repeat(281) }] })).toBeNull();
    expect(parse({ items: [{ ...first, title: "x".repeat(129) }] })).toBeNull();
    expect(parseMarkdownFacts("{")).toBeNull();
    expect(parseMarkdownFacts(JSON.stringify(facts) + " ".repeat(65536))).toBeNull();
  });
  it("counts only toned items, in severity order", () => {
    const items = parse({
      items: [
        { title: "A", brief: "a", tone: "ok" },
        { title: "B", brief: "b", tone: "problem" },
        { title: "C", brief: "c" },
        { title: "D", brief: "d", tone: "problem" },
      ],
    })!.items;
    expect(factToneCounts(items)).toEqual([
      { tone: "problem", count: 2 },
      { tone: "ok", count: 1 },
    ]);
    expect(factToneCounts(parse({ items: [{ title: "A", brief: "a" }] })!.items)).toEqual([]);
  });
});
