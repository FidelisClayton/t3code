import { EnvironmentId, ThreadId, type OrchestrationV2ShellSnapshot } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { Atom, AtomRegistry } from "effect/reactivity";
import { describe, expect, it } from "vite-plus/test";

import { PrimaryConnectionTarget } from "../connection/model.ts";
import { v2ShellSnapshot, v2ThreadShell } from "./orchestrationV2TestFixtures.ts";
import { reuseUnchangedThreadShells } from "./shellReducer.ts";
import { createEnvironmentThreadShellAtoms } from "./threadShell.ts";

const environmentId = EnvironmentId.make("environment-v2");

function makeHarness() {
  const snapshotAtom = Atom.family((_environmentId: EnvironmentId) =>
    Atom.make<OrchestrationV2ShellSnapshot | null>(v2ShellSnapshot),
  );
  const catalogValueAtom = Atom.make({
    isReady: true,
    entries: new Map([
      [
        environmentId,
        {
          target: new PrimaryConnectionTarget({
            environmentId,
            label: "Environment",
            httpBaseUrl: "https://example.test",
            wsBaseUrl: "wss://example.test",
          }),
          profile: Option.none(),
          enabled: true,
        },
      ],
    ]),
  });
  return {
    registry: AtomRegistry.make(),
    snapshotAtom,
    threads: createEnvironmentThreadShellAtoms({
      catalogValueAtom,
      snapshotAtom,
      hiddenThreadTagsAtom: () => Atom.make(null),
    }),
  };
}

describe("v2 thread shell lists (fork)", () => {
  it("normalizes creation links from old servers and retains them across shell updates", () => {
    const { registry, threads, snapshotAtom } = makeHarness();
    registry.set(snapshotAtom(environmentId), { ...v2ShellSnapshot, threads: [v2ThreadShell] });
    const dispose = registry.mount(threads.threadShellsAtom);
    expect(registry.get(threads.threadShellsAtom)[0]?.createdThreadIds).toEqual([]);
    const createdThreadIds = [ThreadId.make("created-child")];
    const snapshot = { ...v2ShellSnapshot, threads: [{ ...v2ThreadShell, createdThreadIds }] };
    registry.set(snapshotAtom(environmentId), snapshot);
    const before = registry.get(threads.threadShellsAtom);
    expect(before[0]?.createdThreadIds).toBe(createdThreadIds);
    registry.set(
      snapshotAtom(environmentId),
      reuseUnchangedThreadShells(snapshot, {
        ...snapshot,
        threads: [{ ...snapshot.threads[0]!, createdThreadIds: [...createdThreadIds] }],
      }),
    );
    expect(registry.get(threads.threadShellsAtom)).toBe(before);
    dispose();
    registry.dispose();
  });
});
