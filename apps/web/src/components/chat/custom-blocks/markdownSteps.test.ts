import { describe, expect, it } from "vite-plus/test";
import { parseMarkdownSteps } from "./markdownSteps";

const plan = {
  title: "Execution plan",
  items: [
    { label: "Foundation", owner: "agent", state: "planned" },
    {
      label: "Parallel area migrations",
      owner: "agent",
      state: "planned",
      detail: "Each area is **independent**",
      parallel: [
        { label: "Backoffice", owner: "agent", state: "planned" },
        { label: "Law firm" },
        { label: "Portal" },
      ],
    },
    { label: "Validation", owner: "user", state: "pending" },
  ],
};
const parse = (value: unknown) => parseMarkdownSteps(JSON.stringify(value));
const item = plan.items[0]!;

describe("Markdown steps", () => {
  it("accepts the execution plan fixture", () => {
    expect(parse(plan)?.items).toHaveLength(3);
    expect(parse({ ordered: false, items: [{ label: "A" }] })).not.toBeNull();
  });

  it("rejects invalid, excess and oversized data", () => {
    const invalid = [
      "{",
      {},
      { ...plan, extra: true },
      { ...plan, title: "" },
      { ...plan, ordered: "yes" },
      { items: [] },
      { items: Array.from({ length: 31 }, () => item) },
      { items: [{ label: " " }] },
      { items: [{ label: "x".repeat(513) }] },
      { items: [{ ...item, owner: "robot" }] },
      { items: [{ ...item, state: "running" }] },
      { items: [{ ...item, detail: "x".repeat(8193) }] },
      { items: [{ ...item, extra: 1 }] },
      { items: [{ ...item, parallel: [] }] },
      { items: [{ ...item, parallel: Array.from({ length: 13 }, () => ({ label: "A" })) }] },
      { items: [{ ...item, parallel: [{ label: "x".repeat(257) }] }] },
      { items: [{ ...item, parallel: [{ label: "A", detail: "no" }] }] },
    ];
    for (const value of invalid)
      expect(typeof value === "string" ? parseMarkdownSteps(value) : parse(value)).toBeNull();
    expect(parseMarkdownSteps(JSON.stringify(plan) + " ".repeat(65536))).toBeNull();
  });
});
