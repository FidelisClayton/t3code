import { describe, expect, it } from "vite-plus/test";
import {
  analyzeMarkdownChoices,
  parseMarkdownChoiceHref,
  toggleMarkdownChoice,
} from "./markdownChoices";

describe("Markdown choices", () => {
  it("accepts bounded literal identifiers and rejects extra URL syntax", () => {
    expect(parseMarkdownChoiceHref("choice:personas/parallel")).toEqual({
      mode: "single",
      group: "personas",
      value: "parallel",
    });
    expect(parseMarkdownChoiceHref("choices:verify/unit")).toEqual({
      mode: "multi",
      group: "verify",
      value: "unit",
    });
    for (const href of [
      "choice:/x",
      "choice:g/a\n",
      "choice:g/",
      "choice:g/x/y",
      "choice://g/x",
      "choice:g/x?q=1",
      "choice:g/x#n",
      "choice:g/%78",
      "choice:g/..",
      "Choice:g/x",
      `choice:${"g".repeat(65)}/x`,
      "javascript:alert(1)",
    ]) {
      expect(parseMarkdownChoiceHref(href), href).toBeNull();
    }
  });

  it("finds reference links, ignores code and fails closed on mixed group modes", () => {
    expect(
      analyzeMarkdownChoices(
        "[A](choice:g/a) [B][b]\n\n[b]: choices:g/b\n\n`[C](choices:s/a)`\n\n```md\n[D](choices:s/a)\n```\n\n[S](choice:s/b)",
      ).groups,
    ).toEqual(
      new Map([
        ["g", "conflict"],
        ["s", "single"],
      ]),
    );
  });

  it("replaces and toggles single choices, toggles multiple choices independently and isolates groups", () => {
    const a = { mode: "single", group: "g", value: "a" } as const;
    const b = { ...a, value: "b" };
    const other = { mode: "multi", group: "other", value: "a" } as const;
    let state = toggleMarkdownChoice({}, a);
    state = toggleMarkdownChoice(state, other);
    state = toggleMarkdownChoice(state, b);
    expect(state).toEqual({ g: ["b"], other: ["a"] });
    state = toggleMarkdownChoice(state, { ...other, value: "b" });
    state = toggleMarkdownChoice(state, b);
    state = toggleMarkdownChoice(state, other);
    expect(state).toEqual({ g: [], other: ["b"] });
  });
});
