import { describe, expect, it } from "vite-plus/test";
import { parseMarkdownScope } from "./markdownScope";

const scope = {
  title: "Manual scope",
  unit: "files",
  overlapping: true,
  caveat: "Regex counts are lower bounds",
  items: [
    { label: "Dates", count: 12, note: "highest behaviour risk" },
    { label: "NumberInput", count: 8 },
    { label: "Combobox", count: 7 },
    { label: "Stepper", count: 7 },
    { label: "Spotlight", count: 5 },
    { label: "Toasts", count: 2 },
  ],
};
const parse = (value: unknown) => parseMarkdownScope(JSON.stringify(value));

describe("Markdown scope", () => {
  it("accepts the migration fixture", () => {
    expect(parse(scope)?.items).toHaveLength(6);
  });
  it("rejects invalid input", () => {
    expect(parseMarkdownScope("{")).toBeNull();
    expect(parseMarkdownScope(JSON.stringify(scope) + " ".repeat(65536))).toBeNull();
    expect(parse({ ...scope, extra: 1 })).toBeNull();
    expect(parse({ ...scope, items: [] })).toBeNull();
    expect(
      parse({ ...scope, items: Array.from({ length: 21 }, () => ({ label: "A", count: 1 })) }),
    ).toBeNull();
    expect(parse({ ...scope, items: [{ label: "A", count: -1 }] })).toBeNull();
    expect(parse({ ...scope, items: [{ label: "A", count: "1" }] })).toBeNull();
    expect(
      parseMarkdownScope('{"title":"t","unit":"u","items":[{"label":"A","count":1e999}]}'),
    ).toBeNull();
    expect(parse({ ...scope, title: undefined })).toBeNull();
    expect(parse({ ...scope, unit: " " })).toBeNull();
    expect(parse({ ...scope, caveat: "x".repeat(1025) })).toBeNull();
  });
});
