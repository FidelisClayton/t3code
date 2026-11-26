import { describe, expect, it } from "vite-plus/test";
import { parseMarkdownSwatches } from "./markdownSwatches";

const providerSwatches = {
  title: "Status palette",
  items: [
    { label: "Violet", role: "Signing status", hex: "#7c3aed", illustrative: true },
    { label: "Violet", role: "Intake stage", illustrative: true },
  ],
};
const parse = (value: object) => parseMarkdownSwatches(JSON.stringify(value));

describe("Markdown swatches", () => {
  it("accepts the palette fixture, with or without hex", () => {
    expect(parse(providerSwatches)?.items).toHaveLength(2);
  });

  it.each([
    ["short hex", { hex: "#fff" }],
    ["named color", { hex: "red" }],
    ["style injection", { hex: "#7c3aed; background: url(x)" }],
    ["blank role", { role: " " }],
    ["unknown key", { extra: 1 }],
  ])("rejects %s", (_name, patch) => {
    expect(parse({ items: [{ ...providerSwatches.items[0], ...patch }] })).toBeNull();
  });

  it("rejects empty and oversized lists, bad JSON", () => {
    expect(parse({ items: [] })).toBeNull();
    expect(
      parse({ items: Array.from({ length: 13 }, () => providerSwatches.items[0]) }),
    ).toBeNull();
    expect(parseMarkdownSwatches("nope")).toBeNull();
  });
});
