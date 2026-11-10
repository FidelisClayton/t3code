import { describe, expect, it } from "vite-plus/test";
import { parseMarkdownRecap } from "./markdownRecap";

const item = {
  label: "E-406",
  status: "running",
  summary: "CI running",
  details: "Rich **details**",
};
const recap = { lead: "Nothing needs you.", items: [item] };

describe("Markdown recap", () => {
  it("accepts scoped work links without decoding canonical percent escapes", () => {
    for (const url of [
      "t3-thread://v2/remote-env/task%3Achild",
      "https://app.t3.codes/threads/remote-env/task%253Achild",
    ]) {
      const parsed = parseMarkdownRecap(
        JSON.stringify({
          ...recap,
          items: [{ ...item, reference: "linear/E-406", work: { kind: "subagent", url } }],
          next: [{ label: "Next" }],
        }),
      );
      expect(parsed?.items[0]?.work?.ref).toEqual({
        environmentId: "remote-env",
        threadId: "task%3Achild",
      });
    }
    expect(parseMarkdownRecap(JSON.stringify(recap))?.items[0]?.work).toBeUndefined();
  });

  it("rejects invalid, excess and oversized agent data", () => {
    const invalid = [
      {},
      { ...recap, extra: true },
      { ...recap, lead: " " },
      { ...recap, lead: "x".repeat(2049) },
      { ...recap, items: [] },
      { ...recap, items: Array.from({ length: 33 }, () => ({ ...item })) },
      { ...recap, next: [] },
      { ...recap, next: Array.from({ length: 33 }, () => ({ label: "Next" })) },
      { ...recap, next: [{ label: "Next", extra: true }] },
      ...[
        { status: "done" },
        { label: "x".repeat(257) },
        { summary: "x".repeat(1025) },
        { details: "x".repeat(32769) },
        { details: "" },
        { reference: "bad id" },
        { extra: true },
        ...[
          "javascript:alert(1)",
          "https://evil.test/threads/env/task",
          "t3-thread://v1/task",
          "t3-thread://v2//task",
        ].map((url) => ({ work: { kind: "thread", url } })),
        { work: { kind: "task", url: "t3-thread://v2/env/task" } },
        { work: { kind: "thread", url: "t3-thread://v2/env/task", extra: true } },
      ].map((patch) => ({ ...recap, items: [{ ...item, ...patch }] })),
    ];
    for (const value of invalid)
      expect(
        parseMarkdownRecap(JSON.stringify(value)),
        JSON.stringify(value).slice(0, 100),
      ).toBeNull();
    expect(parseMarkdownRecap("{")).toBeNull();
    expect(parseMarkdownRecap(" ".repeat(65537))).toBeNull();
  });
});
