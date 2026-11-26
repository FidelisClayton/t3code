import { describe, expect, it } from "vite-plus/test";
import { parseMarkdownCompare } from "./markdownCompare";

const bambu = {
  title: "Choose a connection method",
  attributes: [
    { id: "remote", label: "Remote printing" },
    { id: "cloud", label: "Cloud dependency" },
    { id: "handy", label: "Bambu Handy" },
  ],
  options: [
    {
      id: "cloud",
      title: "Cloud",
      summary: "Keep Bambu Handy",
      values: { remote: "Yes", cloud: "Yes", handy: "Yes" },
      recommended: "Least setup",
      choice: "mode/cloud",
    },
    {
      id: "local",
      title: "Local + Developer Mode",
      summary: "Direct LAN control",
      values: { remote: "No*", handy: "No*" },
      choice: "mode/local",
    },
  ],
};
const parse = (value: unknown) => parseMarkdownCompare(JSON.stringify(value));
const option = bambu.options[0]!;

describe("Markdown compare", () => {
  it("accepts the Bambu fixture and options without choices", () => {
    expect(parse(bambu)?.options).toHaveLength(2);
    const noChoice = bambu.options.map(({ choice: _choice, ...rest }) => rest);
    expect(parse({ ...bambu, options: noChoice })).not.toBeNull();
  });

  it("rejects invalid, excess and oversized data", () => {
    const invalid = [
      "{",
      {},
      { ...bambu, extra: true },
      { ...bambu, title: " " },
      { ...bambu, attributes: [] },
      { ...bambu, attributes: Array.from({ length: 13 }, (_, i) => ({ id: `a${i}`, label: "A" })) },
      { ...bambu, attributes: [bambu.attributes[0], bambu.attributes[0]] },
      { ...bambu, attributes: [{ id: "bad id", label: "A" }] },
      { ...bambu, options: [option] },
      {
        ...bambu,
        options: [option, { ...option, id: "b" }, { ...option, id: "c" }, option, option],
      },
      { ...bambu, options: [option, { ...option }] },
      { ...bambu, options: [option, { ...bambu.options[1], values: { unknown: "x" } }] },
      { ...bambu, options: [option, { ...bambu.options[1], values: { remote: "x".repeat(513) } }] },
      { ...bambu, options: [option, { ...bambu.options[1], choice: "no-slash" }] },
      { ...bambu, options: [option, { ...bambu.options[1], choice: "other/local" }] },
      { ...bambu, options: [option, { ...bambu.options[1], choice: option.choice }] },
      { ...bambu, options: [option, { ...bambu.options[1], extra: 1 }] },
      { ...bambu, options: [option, { ...bambu.options[1], title: "x".repeat(129) }] },
    ];
    for (const value of invalid)
      expect(typeof value === "string" ? parseMarkdownCompare(value) : parse(value)).toBeNull();
    expect(parseMarkdownCompare(JSON.stringify(bambu) + " ".repeat(65536))).toBeNull();
  });
});
