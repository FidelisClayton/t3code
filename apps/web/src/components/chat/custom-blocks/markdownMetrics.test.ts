import { describe, expect, it } from "vite-plus/test";
import { parseMarkdownMetrics } from "./markdownMetrics";

const items = [
  { label: "Affected files", value: "482", qualifier: "regex lower bound" },
  { label: "Manual rewrites", value: "~40" },
  { label: "CSS modules retained", value: "376" },
];
const parse = (value: unknown) => parseMarkdownMetrics(JSON.stringify(value));

describe("Markdown metrics", () => {
  it("accepts the migration fixture", () => {
    expect(parse({ items })?.items).toHaveLength(3);
  });
  it("rejects invalid input", () => {
    expect(parseMarkdownMetrics("{")).toBeNull();
    expect(parseMarkdownMetrics(JSON.stringify({ items }) + " ".repeat(65536))).toBeNull();
    expect(parse({ items: [] })).toBeNull();
    expect(parse({ items: [...items, ...items] })).toBeNull();
    expect(parse({ items, extra: 1 })).toBeNull();
    expect(parse({ items: [{ label: "A", value: "x".repeat(33) }] })).toBeNull();
    expect(parse({ items: [{ label: " ", value: "1" }] })).toBeNull();
    expect(parse({ items: [{ label: "A", value: "1", extra: 1 }] })).toBeNull();
  });
});
