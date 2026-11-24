import { assert, describe, it } from "@effect/vitest";
import { vi } from "vite-plus/test";

vi.mock("electron", () => ({
  net: { fetch: vi.fn() },
  protocol: { handle: vi.fn(), unhandle: vi.fn() },
}));

import * as ElectronProtocol from "./ElectronProtocol.ts";

describe("ElectronProtocol", () => {
  it("gives fork builds their own scheme in every mode", () => {
    assert.equal(ElectronProtocol.getDesktopScheme(false), "t3code");
    assert.equal(ElectronProtocol.getDesktopScheme(true), "t3code-dev");
    assert.equal(ElectronProtocol.getDesktopScheme(false, "fidelis"), "t3code-fidelis");
    assert.equal(ElectronProtocol.getDesktopScheme(true, "fidelis"), "t3code-fidelis");
  });
});
