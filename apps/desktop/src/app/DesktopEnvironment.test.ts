import * as NodePath from "@effect/platform-node/NodePath";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import * as DesktopConfig from "./DesktopConfig.ts";

const defaultInput = {
  dirname: "/repo/apps/desktop/dist-electron",
  homeDirectory: "/Users/alice",
  platform: "darwin",
  processArch: "arm64",
  appVersion: "0.0.22",
  appPath: "/Applications/T3 Code.app/Contents/Resources/app.asar",
  isPackaged: false,
  resourcesPath: "/Applications/T3 Code.app/Contents/Resources",
  runningUnderArm64Translation: false,
} satisfies DesktopEnvironment.MakeDesktopEnvironmentInput;

const layerEnvironment = (
  overrides: Partial<DesktopEnvironment.MakeDesktopEnvironmentInput> = {},
  env: Record<string, string | undefined> = {},
) =>
  DesktopEnvironment.layer({
    ...defaultInput,
    ...overrides,
  }).pipe(
    Layer.provide(
      Layer.mergeAll(NodeServices.layer, NodePath.layerPosix, DesktopConfig.layerTest(env)),
    ),
  );

const makeEnvironment = (
  overrides: Partial<DesktopEnvironment.MakeDesktopEnvironmentInput> = {},
  env: Record<string, string | undefined> = {},
) => DesktopEnvironment.DesktopEnvironment.pipe(Effect.provide(layerEnvironment(overrides, env)));

describe("DesktopEnvironment", () => {
  it.effect("uses the packaged Windows server sidecar as the backend root", () =>
    Effect.gen(function* () {
      const environment = yield* makeEnvironment({
        platform: "win32",
        isPackaged: true,
        appPath: "/install/resources/app.asar",
        resourcesPath: "/install/resources",
      });

      assert.equal(environment.appRoot, "/install/resources/app.asar");
      assert.equal(environment.serverRoot, "/install/resources/server.asar");
      assert.equal(
        environment.backendEntryPath,
        "/install/resources/server.asar/apps/server/dist/bin.mjs",
      );
      assert.equal(
        environment.clientAssetsDir,
        "/install/resources/server.asar/apps/server/dist/client",
      );
    }),
  );

  it.effect("keeps implicit development state separate from production state", () =>
    Effect.gen(function* () {
      const development = yield* makeEnvironment(
        {},
        { VITE_DEV_SERVER_URL: "http://localhost:5173" },
      );
      const production = yield* makeEnvironment();

      assert.equal(development.stateDir, "/Users/alice/.t3/dev");
      assert.equal(production.stateDir, "/Users/alice/.t3/userdata");
    }),
  );

  it.effect(
    "gives fork builds their own data home and identity, and leaves official ones alone",
    () =>
      Effect.gen(function* () {
        const appVersion = "0.1.11-nightly.20261118.4877+fidelis.1";
        const fork = yield* makeEnvironment({ appVersion });
        const pinned = yield* makeEnvironment({ appVersion }, { T3CODE_HOME: "/data/t3" });
        const official = yield* makeEnvironment({ appVersion: "0.1.11-nightly.20261118.4877" });

        assert.equal(fork.forkId, "fidelis");
        assert.equal(fork.baseDir, "/Users/alice/.t3-fidelis");
        assert.equal(fork.stateDir, "/Users/alice/.t3-fidelis/userdata");
        assert.equal(fork.displayName, "T3 Code (Fidelis)");
        assert.equal(fork.branding.stageLabel, "Nightly");
        assert.equal(fork.appUserModelId, "dev.fidelis.t3code");
        assert.equal(fork.linuxDesktopEntryName, "dev.fidelis.t3code.desktop");
        assert.equal(pinned.baseDir, "/data/t3");
        assert.isUndefined(official.forkId);
        assert.equal(official.baseDir, "/Users/alice/.t3");
        assert.equal(official.displayName, "T3 Code (Nightly)");
        assert.equal(official.appUserModelId, "com.t3tools.t3code");
      }),
  );
});
