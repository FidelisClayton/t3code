import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { resolveUserDataPath } from "./DesktopUserData.ts";

it.effect("keeps a fork build's profile apart from the official app's", () =>
  Effect.gen(function* () {
    const userDataPath = yield* resolveUserDataPath({
      appDataDirectory: "/appdata",
      isDevelopment: false,
      platform: "win32",
      forkId: "fidelis",
    });
    assert.equal(userDataPath, "/appdata/t3code-fidelis");
  }).pipe(Effect.provide(NodeServices.layer)),
);
