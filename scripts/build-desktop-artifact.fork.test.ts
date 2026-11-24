import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";

import { createBuildConfig, resolveDesktopUpdateChannel } from "./build-desktop-artifact.ts";

it.layer(NodeServices.layer)("build-desktop-artifact", (it) => {
  it.effect("gives fork builds their own app identity and no update feed", () =>
    Effect.gen(function* () {
      const build = (version: string) =>
        createBuildConfig("mac", "dmg", version, false, false, undefined, undefined);
      const official = yield* build("0.1.11-nightly.20261118.4877");
      const fork = yield* build("0.1.11-nightly.20261118.4877+fidelis.1");
      const schemes = (config: Record<string, unknown>) =>
        (config.mac as { protocols: { schemes: string[] }[] }).protocols[0]?.schemes;

      assert.equal(
        resolveDesktopUpdateChannel("0.1.11-nightly.20261118.4877+fidelis.1"),
        "nightly",
      );
      assert.equal(official.appId, "com.t3tools.t3code");
      assert.equal(official.productName, "T3 Code (Nightly)");
      assert.isArray(official.publish);
      assert.deepEqual(schemes(official), ["t3code", "t3code-dev"]);
      assert.equal(fork.appId, "dev.fidelis.t3code");
      assert.equal(fork.productName, "T3 Code (Fidelis)");
      assert.isNull(fork.publish);
      assert.deepEqual(schemes(fork), ["t3code-fidelis"]);
    }).pipe(
      Effect.provide(
        ConfigProvider.layer(
          ConfigProvider.fromEnv({ env: { GITHUB_REPOSITORY: "pingdotgg/t3code" } }),
        ),
      ),
    ),
  );
});
