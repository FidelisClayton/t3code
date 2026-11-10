import { describe, expect, it } from "vite-plus/test";
import { parseMarkdownForm } from "./markdownForm";

describe("parseMarkdownForm", () => {
  it("decodes text and select fields and rejects invalid or incomplete payloads", () => {
    const form = {
      title: "Trip",
      fields: [
        { type: "text", name: "destination", label: "Destination", required: true },
        { type: "select", name: "transport", label: "Transport", options: ["Train", "Bus"] },
      ],
    };
    expect(parseMarkdownForm(JSON.stringify(form))).toEqual(form);
    for (const source of [
      "{",
      "null",
      JSON.stringify({ ...form, fields: [{ type: "number", name: "n", label: "Number" }] }),
      JSON.stringify({ ...form, fields: [form.fields[0], form.fields[0]] }),
      JSON.stringify({ ...form, fields: [{ ...form.fields[1], options: [] }] }),
      JSON.stringify({ ...form, fields: [{ ...form.fields[0], required: "yes" }] }),
    ]) {
      expect(parseMarkdownForm(source)).toBeNull();
    }
  });
});
