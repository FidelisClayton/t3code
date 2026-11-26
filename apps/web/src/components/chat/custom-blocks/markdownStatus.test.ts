import { describe, expect, it } from "vite-plus/test";
import { parseMarkdownStatus } from "./markdownStatus";

const providerStatus = {
  title: "Provider page updates",
  attention: "none",
  state: "in_progress",
  body: "Proceeding with violet Signing status and back-navigation improvements.",
  default: "Violet Signing status",
  notes: [
    {
      kind: "tradeoff",
      text: "Same violet as Intake; labels and network dots distinguish the chips.",
      detail: "Palette roles and conflicts",
    },
    { kind: "reversible", text: "Separate named color setting, one-line change." },
  ],
};
const parse = (value: object) => parseMarkdownStatus(JSON.stringify(value));

describe("Markdown status", () => {
  it("accepts the Provider page fixture", () => {
    expect(parse(providerStatus)?.notes).toHaveLength(2);
  });

  it.each([
    ["blank title", { title: " " }],
    ["blocking attention", { attention: "blocked" }],
    ["unknown state", { state: "finished" }],
    ["missing body", { body: undefined }],
    ["unknown key", { extra: 1 }],
    ["empty notes", { notes: [] }],
    ["seven notes", { notes: Array.from({ length: 7 }, () => ({ kind: "tradeoff", text: "x" })) }],
    ["unknown note kind", { notes: [{ kind: "risk", text: "x" }] }],
    ["long default", { default: "x".repeat(513) }],
  ])("rejects %s", (_name, patch) => {
    expect(parse({ ...providerStatus, ...patch })).toBeNull();
  });

  it("rejects invalid JSON and oversized sources", () => {
    expect(parseMarkdownStatus("{")).toBeNull();
    expect(parseMarkdownStatus(JSON.stringify(providerStatus) + " ".repeat(65536))).toBeNull();
  });
});
