import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { threadKey } from "@t3tools/client-runtime/state/entities";
import { presentThreadShell } from "@t3tools/client-runtime/state/models";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { makeThreadFixture } from "../test-fixtures";
import { filterSidebarV2VisibleThreads, searchSidebarThreads } from "./Sidebar.logic";
import {
  buildSidebarThreadFamilies,
  flattenSidebarThreadFamilies,
} from "./sidebar/SidebarThreadFamilies.logic";

const localEnvironmentId = EnvironmentId.make("environment-local");

describe("Boring thread families", () => {
  const shell = (
    id: string,
    children: string[] = [],
    environmentId = localEnvironmentId,
    projectId = "project-1",
  ) =>
    presentThreadShell(environmentId, {
      ...makeThreadFixture().source,
      id: ThreadId.make(id),
      title: id,
      projectId: ProjectId.make(projectId),
      createdThreadIds: children.map((id) => ThreadId.make(id)),
    });
  const sections = (
    active: ReturnType<typeof shell>[],
    pinned: ReturnType<typeof shell>[] = [],
  ) => ({ pinned, active, working: [], snoozed: [], settled: [] });
  const key = (id: string) =>
    scopedThreadKey(scopeThreadRef(localEnvironmentId, ThreadId.make(id)));

  it("keeps a pinned child's multilevel family together, with one visible sequence and explicit collapse", () => {
    const parent = shell("parent", ["child"]);
    const child = shell("child", ["grandchild"]);
    const grandchild = shell("grandchild");
    const forest = buildSidebarThreadFamilies(sections([parent, grandchild], [child]));
    expect(forest.sections.pinned.map((thread) => thread.id)).toEqual([parent.id]);
    expect(forest.sections.active).toEqual([]);
    expect(
      flattenSidebarThreadFamilies(forest, forest.sections.pinned, {}).map((row) => [
        row.thread.id,
        row.depth,
      ]),
    ).toEqual([
      [parent.id, 0],
      [child.id, 1],
      [grandchild.id, 2],
    ]);
    expect(
      flattenSidebarThreadFamilies(forest, forest.sections.pinned, { [key("child")]: false }).map(
        (row) => row.thread.id,
      ),
    ).toEqual([parent.id, child.id]);
    expect(forest.parentByKey.get(key("grandchild"))).toBe(key("child"));
    expect(forest.ownSection.get(key("parent"))).toBe("active");
    expect(forest.ownSection.get(key("child"))).toBe("pinned");
  });

  it("leaves conflicting, cyclic, self, cross-project and unavailable links as reachable roots", () => {
    const input = [
      shell("a", ["b", "shared", "other-project", "missing"]),
      shell("b", ["a", "shared"]),
      shell("shared"),
      shell("self", ["self"]),
      shell("other-project", [], localEnvironmentId, "other"),
      shell("fork"),
    ];
    const forest = buildSidebarThreadFamilies(sections(input));
    const rows = flattenSidebarThreadFamilies(forest, forest.sections.active, {});
    expect(new Set(rows.map((row) => row.thread.id)).size).toBe(input.length);
    expect(forest.parentByKey.has(key("a"))).toBe(false);
    expect(forest.parentByKey.has(key("b"))).toBe(false);
    expect(forest.parentByKey.has(key("shared"))).toBe(false);
    expect(forest.parentByKey.has(key("self"))).toBe(false);
    expect(forest.parentByKey.has(key("other-project"))).toBe(false);
    expect(forest.parentByKey.has(key("fork"))).toBe(false);
  });

  it("keeps hidden children absent and leaves an archived parent's child and manual fork as roots", () => {
    const parent = shell("parent", ["subagent", "side-chat", "delegated", "child"]);
    const subagent = {
      ...shell("subagent"),
      lineage: {
        rootThreadId: parent.id,
        parentThreadId: parent.id,
        relationshipToParent: "subagent" as const,
      },
    };
    const fork = {
      ...shell("fork"),
      lineage: {
        rootThreadId: parent.id,
        parentThreadId: parent.id,
        relationshipToParent: "fork" as const,
      },
    };
    const sideChat = { ...shell("side-chat"), lineage: { ...parent.lineage, sideChat: true } };
    const input = [parent, subagent, sideChat, shell("delegated"), shell("child"), fork];
    const eligible = filterSidebarV2VisibleThreads(
      input,
      null,
      new Set([threadKey(scopeThreadRef(localEnvironmentId, ThreadId.make("delegated")))]),
    );
    const forest = buildSidebarThreadFamilies(sections(eligible));
    expect(
      flattenSidebarThreadFamilies(forest, forest.sections.active, {}).map((row) => row.thread.id),
    ).toEqual([parent.id, ThreadId.make("child"), fork.id]);
    expect(forest.parentByKey.has(key("fork"))).toBe(false);
    const orphanForest = buildSidebarThreadFamilies(
      sections(
        filterSidebarV2VisibleThreads(
          [{ ...parent, archivedAt: "2026-01-01T00:00:00Z" }, shell("child")],
          null,
          new Set(),
        ),
      ),
    );
    expect(orphanForest.sections.active.map((thread) => thread.id)).toEqual([
      ThreadId.make("child"),
    ]);
    expect(
      searchSidebarThreads(eligible, "child", new Set()).titleMatches.map((thread) => thread.id),
    ).toContain(ThreadId.make("child"));
  });

  it("scopes identical IDs to their environment and never materializes absent children", () => {
    const remote = EnvironmentId.make("remote");
    const forest = buildSidebarThreadFamilies(
      sections([
        shell("parent", ["child", "hidden"]),
        shell("child"),
        shell("parent", [], remote),
        shell("child", [], remote),
      ]),
    );
    expect(forest.parentByKey.size).toBe(1);
    expect(flattenSidebarThreadFamilies(forest, forest.sections.active, {}).length).toBe(4);
  });
});
