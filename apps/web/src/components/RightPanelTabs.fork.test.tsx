import { describe, expect, it } from "vite-plus/test";

import { surfaceShortcutActionForKey } from "./RightPanelTabs";

describe("surface shortcuts", () => {
  it("follows the typed letter to the Run action", () => {
    const actions = [
      { shortcut: "B", available: true, label: "Browser" },
      { shortcut: "R", available: true, label: "Run" },
    ] as const;
    expect(
      surfaceShortcutActionForKey(actions, {
        key: "r",
        code: "KeyR",
        altKey: false,
        ctrlKey: false,
        defaultPrevented: false,
        isComposing: false,
        metaKey: false,
      }),
    ).toBe(actions[1]);
  });
});
