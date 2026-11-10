import { describe, expect, it } from "vite-plus/test";
import {
  extractMarkdownReferenceDefinitions,
  parseMarkdownReferenceDefinition,
  parseMarkdownReferenceHref,
} from "./markdownReferences.ts";

const reference = { id: "linear/E-406", title: "Answer", body: "  **Keep whitespace**\n" };
const json = JSON.stringify(reference);
const fence = `\`\`\`reference\n${json}\n\`\`\``;

describe("Markdown references", () => {
  it("accepts only literal bounded namespace/name links", () => {
    expect(parseMarkdownReferenceHref("ref:linear/E-406")).toBe(reference.id);
    expect(parseMarkdownReferenceHref(`ref:${"a".repeat(64)}/${"Z".repeat(64)}`)).not.toBeNull();
    for (const href of [
      "REF:linear/E-406",
      "ref:Linear/E-406",
      "ref:linear/E-406?x",
      "ref:linear/E-406#x",
      "ref:linear/%45-406",
      "ref:linear/a/b",
      "ref:linear/a\n",
      "ref:linear/_a",
      `ref:${"a".repeat(65)}/a`,
      "ref:linear/",
    ]) {
      expect(parseMarkdownReferenceHref(href), href).toBeNull();
    }
  });

  it("validates JSON fields and bounds without changing body whitespace", () => {
    expect(parseMarkdownReferenceDefinition(json)).toEqual(reference);
    expect(parseMarkdownReferenceDefinition(JSON.stringify({ ...reference, summary: "" }))).toEqual(
      { ...reference, summary: "" },
    );
    for (const value of [
      null,
      [],
      {},
      { ...reference, extra: true },
      { ...reference, title: "" },
      { ...reference, title: "x".repeat(257) },
      { ...reference, summary: "x".repeat(1025) },
      { ...reference, body: " \n" },
      { ...reference, body: "x".repeat(32769) },
      { ...reference, id: "bad" },
    ]) {
      expect(parseMarkdownReferenceDefinition(JSON.stringify(value))).toBeNull();
    }
    expect(parseMarkdownReferenceDefinition("{")).toBeNull();
    expect(parseMarkdownReferenceDefinition(" ".repeat(65537) + json)).toBeNull();
  });

  it("extracts real closed fences in source order through Markdown nesting", () => {
    const nested = `> ~~~reference\n> ${json}\n> ~~~~\n\n- item\n\n  \`\`\`reference\n  ${json}\n  \`\`\``;
    expect(extractMarkdownReferenceDefinitions(`${fence}\n\n${nested}`)).toEqual([
      reference,
      reference,
      reference,
    ]);
    expect(
      extractMarkdownReferenceDefinitions(fence.replace("```reference", "``` reference")),
    ).toEqual([reference]);
    expect(extractMarkdownReferenceDefinitions(fence.replaceAll("\n", "\r\n"))).toEqual([
      reference,
    ]);
  });

  it("ignores incomplete, invalid, meta, inline and sample definitions", () => {
    for (const source of [
      fence.slice(0, -3),
      fence.replace("\n```", "\n    ```"),
      fence.replace("reference", "reference extra"),
      "`" + json + "`",
      `\`\`\`\`markdown\n${fence}\n\`\`\`\``,
      `    ${fence.replaceAll("\n", "\n    ")}`,
      `\`\`\`reference\n{}\n\`\`\``,
      `> \`\`\`reference\n> ${json}\n\n\`\`\``,
    ]) {
      expect(extractMarkdownReferenceDefinitions(source), source).toEqual([]);
    }
  });
});
