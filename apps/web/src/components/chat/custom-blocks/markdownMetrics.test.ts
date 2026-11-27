import { describe, expect, it } from "vite-plus/test";
import { parseDiffValue, parseMarkdownMetrics } from "./markdownMetrics";

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
  it("accepts an optional tone and rejects unknown tones", () => {
    expect(parse({ items: [{ label: "A", value: "1", tone: "bad" }] })?.items[0]?.tone).toBe("bad");
    expect(parse({ items: [{ label: "A", value: "1", tone: "neutral" }] })).toBeNull();
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

describe("parseDiffValue", () => {
  it.each(["+14.419 / −185", "+40 / -3", "+1,234 −56", "+5/-1"])("detects %s", (value) => {
    expect(parseDiffValue(value)).not.toBeNull();
  });
  it("splits the parts", () => {
    expect(parseDiffValue("+40 / -3")).toEqual({ added: "+40", separator: " / ", removed: "-3" });
  });
  it.each(["482", "+40", "-3 / +4", "~40", "+40 / 3"])("ignores %s", (value) => {
    expect(parseDiffValue(value)).toBeNull();
  });
});
