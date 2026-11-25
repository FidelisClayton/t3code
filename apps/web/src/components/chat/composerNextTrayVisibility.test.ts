import { describe, expect, it } from "vite-plus/test";
import { resolveNextTray } from "./ComposerNextTray";

const fence = (text: string) =>
  `${text}\n\n\`\`\`next\n${JSON.stringify({
    items: [{ type: "approve", ask: "Push?", actions: [{ label: "Push", choice: "push/do" }] }],
  })}\n\`\`\``;
const assistant = (streaming = false) =>
  ({ item: { type: "assistant_message", id: "a", messageId: "m", streaming } }) as never;
const user = () => ({ item: { type: "user_message", id: "u", messageId: "u" } }) as never;

describe("resolveNextTray", () => {
  it.each([
    ["shows for a settled assistant message with a fence", [assistant()], fence("Done"), true],
    ["hides while streaming", [assistant(true)], fence("Done"), false],
    ["hides after a later user message", [assistant(), user()], fence("Done"), false],
    ["hides without a fence", [assistant()], "Done", false],
  ])("%s", (_name, items, text, shown) => {
    expect(resolveNextTray(items as never, text) !== null).toBe(shown);
  });
});
