import type { EnvironmentServerConfig } from "@t3tools/client-runtime/connection";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { presentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  DEFAULT_CLIENT_SETTINGS,
  EnvironmentId,
  ProjectId,
  RunId,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../test/render";
import { makeThreadFixture } from "../test-fixtures";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { __setClientSettingsForTests, getClientSettings } from "../hooks/useSettings";
import { useThreadRouteTarget } from "../hooks/useThreadRouteTarget";
import { useProjects, useQuietThreadShells, useServerConfigs } from "../state/entities";
import { useUiStateStore } from "../uiStateStore";
import type { Project } from "../types";
import Sidebar from "./Sidebar";
import { SidebarProvider } from "./ui/sidebar";

vi.mock(import("../state/olderSettledShelf"), async (original) => {
  const actual = await original();
  return { ...actual, useOlderSettledShelf: vi.fn(actual.useOlderSettledShelf) };
});
vi.mock("../state/entities", { spy: true });
vi.mock("../state/environments", { spy: true });
vi.mock("../hooks/useHandleNewThread", { spy: true });
vi.mock("../hooks/useNowMinute", { spy: true });
vi.mock("../hooks/useThreadRouteTarget", { spy: true });
vi.mock("./sidebar/SidebarThreadRow", { spy: true });
vi.mock("../state/session", { spy: true });
vi.mock("../state/use-orchestration-command", { spy: true });
vi.mock("../localApi", { spy: true });
vi.mock(import("../state/server"), async (original) => {
  const { Atom } = await import("effect/reactivity");
  const { compileResolvedKeybindingsConfig } = await import("@t3tools/shared/keybindings");
  // The desktop defaults: holding Mod alone already matches a thread jump.
  const keybindings = compileResolvedKeybindingsConfig([
    { key: "mod+1", command: "thread.jump.1" },
    { key: "mod+2", command: "thread.jump.2" },
    { key: "mod+shift+[", command: "thread.previous" },
  ]);
  return { ...(await original()), primaryServerKeybindingsAtom: Atom.make(keybindings) };
});
vi.mock("../commandPaletteBus", () => ({
  openCommandPalette: vi.fn(),
  isCommandPaletteOpen: () => false,
}));
vi.mock("./sidebar/SidebarChrome", () => ({
  SidebarChromeHeader: () => null,
  SidebarChromeFooter: () => null,
}));

function project(id: string): Project {
  return {
    id: ProjectId.make(id),
    environmentId: EnvironmentId.make("local"),
    title: id,
    workspaceRoot: `/projects/${id}`,
    repositoryIdentity: null,
    defaultModelSelection: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    scripts: [],
  };
}

describe("Boring thread disclosure", () => {
  it("reveals a newly routed grandchild once and preserves a later explicit collapse across remount", async () => {
    using stack = new DisposableStack();
    const previousSettings = getClientSettings();
    const previousUiState = useUiStateStore.getState();
    stack.defer(() => {
      __setClientSettingsForTests(previousSettings);
      useUiStateStore.setState(previousUiState);
      vi.mocked(useQuietThreadShells).mockReset();
      vi.mocked(useThreadRouteTarget).mockReset();
    });
    __setClientSettingsForTests({ ...DEFAULT_CLIENT_SETTINGS, boringSidebarEnabled: true });
    const owner = project("family-project");
    const thread = (id: string, children: string[] = []) =>
      presentThreadShell(owner.environmentId, {
        ...makeThreadFixture().source,
        id: ThreadId.make(id),
        title: id,
        projectId: owner.id,
        createdThreadIds: children.map((id) => ThreadId.make(id)),
      });
    const threads = [
      thread("Parent", ["Child"]),
      thread("Child", ["Grandchild"]),
      thread("Grandchild"),
    ];
    const ref = (id: string) => scopeThreadRef(owner.environmentId, ThreadId.make(id));
    const parentKey = scopedThreadKey(ref("Parent"));
    const childKey = scopedThreadKey(ref("Child"));
    useUiStateStore.setState({
      projectExpandedById: {},
      sidebarProjectScopeKeys: [],
      sidebarThreadExpandedByKey: { [parentKey]: false, [childKey]: false },
    });
    vi.mocked(useProjects).mockReturnValue([owner]);
    vi.mocked(useQuietThreadShells).mockReturnValue(threads);
    vi.mocked(useThreadRouteTarget).mockReturnValue({
      kind: "server",
      threadRef: ref("Grandchild"),
    });
    vi.mocked(useHandleNewThread).mockReturnValue({
      activeDraftThread: null,
      activeThread: null,
      defaultProjectRef: { environmentId: owner.environmentId, projectId: owner.id },
      defaultProjectFallbackReady: true,
      handleNewThread: vi.fn(),
      routeDraftId: null,
      routeThreadRef: ref("Grandchild"),
    });
    const reveal = { observedKey: null, pendingKey: null };
    const ui = () => (
      <SidebarProvider>
        <Sidebar routeReveal={reveal} />
      </SidebarProvider>
    );
    await using screen = await render(ui());
    await expect.element(screen.getByRole("button", { name: /^Grandchild,/ })).toBeVisible();
    await vi.waitFor(() => expect(reveal.pendingKey).toBeNull());
    const parent = screen.container.querySelector<HTMLElement>(
      `[data-sidebar-row="${parentKey}"]`,
    )!;
    const routeBefore = screen.router!.state.location.href;
    await userEvent.click(parent.querySelector<HTMLElement>("[data-sidebar-disclosure]")!);
    await expect
      .element(screen.getByRole("button", { name: /^Grandchild,/ }))
      .not.toBeInTheDocument();
    expect(screen.router!.state.location.href).toBe(routeBefore);
    expect(useUiStateStore.getState().sidebarThreadExpandedByKey[parentKey]).toBe(false);
    await screen.rerender(ui());
    await expect
      .element(screen.getByRole("button", { name: /^Grandchild,/ }))
      .not.toBeInTheDocument();
    await screen.rerender(<div />);
    await screen.rerender(ui());
    await expect
      .element(screen.getByRole("button", { name: /^Grandchild,/ }))
      .not.toBeInTheDocument();
    vi.mocked(useThreadRouteTarget).mockReturnValue({ kind: "server", threadRef: ref("Parent") });
    await screen.rerender(ui());
    vi.mocked(useThreadRouteTarget).mockReturnValue({
      kind: "server",
      threadRef: ref("Grandchild"),
    });
    await screen.rerender(ui());
    await expect.element(screen.getByRole("button", { name: /^Grandchild,/ })).toBeVisible();
    // A programmatic click has detail 0; a pointer click right after the disclosure click counts as a double click.
    screen
      .getByRole("button", { name: /^Grandchild,/ })
      .element()
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() =>
      expect(screen.router!.state.location.pathname).toBe("/local/Grandchild"),
    );
  });

  it("shows the wake time of a snoozed created child nested under an active parent", async () => {
    using stack = new DisposableStack();
    const previousSettings = getClientSettings();
    const previousUiState = useUiStateStore.getState();
    stack.defer(() => {
      __setClientSettingsForTests(previousSettings);
      useUiStateStore.setState(previousUiState);
      vi.mocked(useQuietThreadShells).mockReset();
      vi.mocked(useThreadRouteTarget).mockReset();
      vi.mocked(useServerConfigs).mockReset();
    });
    __setClientSettingsForTests({ ...DEFAULT_CLIENT_SETTINGS, boringSidebarEnabled: true });
    const owner = project("family-project");
    const thread = (id: string, children: string[] = [], snoozedUntil: string | null = null) =>
      presentThreadShell(owner.environmentId, {
        ...makeThreadFixture().source,
        id: ThreadId.make(id),
        title: id,
        projectId: owner.id,
        createdThreadIds: children.map((id) => ThreadId.make(id)),
        snoozedUntil: snoozedUntil === null ? null : DateTime.makeUnsafe(snoozedUntil),
      });
    const threads = [thread("Parent", ["Child"]), thread("Child", [], "2999-01-01T00:00:00.000Z")];
    const parentKey = scopedThreadKey(scopeThreadRef(owner.environmentId, ThreadId.make("Parent")));
    const childKey = scopedThreadKey(scopeThreadRef(owner.environmentId, ThreadId.make("Child")));
    useUiStateStore.setState({
      projectExpandedById: {},
      sidebarProjectScopeKeys: [],
      sidebarThreadExpandedByKey: { [parentKey]: true },
    });
    vi.mocked(useServerConfigs).mockReturnValue(
      new Map([[owner.environmentId, {} as unknown as EnvironmentServerConfig]]),
    );
    vi.mocked(useProjects).mockReturnValue([owner]);
    vi.mocked(useQuietThreadShells).mockReturnValue(threads);
    vi.mocked(useThreadRouteTarget).mockReturnValue({ kind: "none" } as never);
    vi.mocked(useHandleNewThread).mockReturnValue({
      activeDraftThread: null,
      activeThread: null,
      defaultProjectRef: { environmentId: owner.environmentId, projectId: owner.id },
      defaultProjectFallbackReady: true,
      handleNewThread: vi.fn(),
      routeDraftId: null,
      routeThreadRef: null,
    });
    await using screen = await render(
      <SidebarProvider>
        <Sidebar routeReveal={{ observedKey: null, pendingKey: null }} />
      </SidebarProvider>,
    );
    await vi.waitFor(() => {
      const row = screen.container.querySelector<HTMLElement>(`[data-sidebar-row="${childKey}"]`);
      expect(row).not.toBeNull();
      expect(row!.querySelector(".text-info-foreground")).not.toBeNull();
    });
  });
  it.each([
    ["card", false],
    ["folder-multiline", true],
  ])("renders the plan line in the %s row layout", async (_layout, folder) => {
    using stack = new DisposableStack();
    const previousSettings = getClientSettings();
    const previousUiState = useUiStateStore.getState();
    stack.defer(() => {
      __setClientSettingsForTests(previousSettings);
      useUiStateStore.setState(previousUiState);
      vi.mocked(useQuietThreadShells).mockReset();
      vi.mocked(useThreadRouteTarget).mockReset();
      vi.mocked(useServerConfigs).mockReset();
    });
    __setClientSettingsForTests({
      ...DEFAULT_CLIENT_SETTINGS,
      boringSidebarEnabled: folder,
      boringSidebarMultilineRows: true,
    });
    // The card layout lives on the Working shelf, which starts collapsed.
    localStorage.setItem("t3code:sidebar:working-expanded", "true");
    stack.defer(() => localStorage.removeItem("t3code:sidebar:working-expanded"));
    const owner = project("plan-project");
    const shell = presentThreadShell(owner.environmentId, {
      ...makeThreadFixture().source,
      id: ThreadId.make("Planner"),
      title: "Planner",
      projectId: owner.id,
      latestRunId: RunId.make("run-1"),
      activeRunId: RunId.make("run-1"),
      status: "running",
      planProgress: { completed: 2, total: 5, current: "Write tests" },
    });
    useUiStateStore.setState({
      projectExpandedById: {},
      sidebarProjectScopeKeys: [],
      sidebarThreadExpandedByKey: {},
    });
    vi.mocked(useServerConfigs).mockReturnValue(
      new Map([[owner.environmentId, {} as unknown as EnvironmentServerConfig]]),
    );
    vi.mocked(useProjects).mockReturnValue([owner]);
    vi.mocked(useQuietThreadShells).mockReturnValue([shell]);
    vi.mocked(useThreadRouteTarget).mockReturnValue({ kind: "none" } as never);
    vi.mocked(useHandleNewThread).mockReturnValue({
      activeDraftThread: null,
      activeThread: null,
      defaultProjectRef: { environmentId: owner.environmentId, projectId: owner.id },
      defaultProjectFallbackReady: true,
      handleNewThread: vi.fn(),
      routeDraftId: null,
      routeThreadRef: null,
    });
    await using screen = await render(
      <SidebarProvider>
        <Sidebar routeReveal={{ observedKey: null, pendingKey: null }} />
      </SidebarProvider>,
    );
    await expect
      .element(screen.getByTestId("sidebar-plan-progress"))
      .toHaveTextContent("2/5·Write tests");
  });
});
