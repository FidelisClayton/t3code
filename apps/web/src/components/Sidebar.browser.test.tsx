import { DEFAULT_CLIENT_SETTINGS, EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../test/render";
import { openCommandPalette } from "../commandPaletteBus";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { __setClientSettingsForTests, getClientSettings } from "../hooks/useSettings";
import { presentThreadShell } from "@t3tools/client-runtime/state/models";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { makeThreadFixture } from "../test-fixtures";
import { useUiStateStore } from "../uiStateStore";
import { useThreadRouteTarget } from "../hooks/useThreadRouteTarget";
import { useProjects, useQuietThreadShells } from "../state/entities";
import type { Project } from "../types";
import Sidebar from "./Sidebar";
import { SidebarProvider } from "./ui/sidebar";

vi.mock("../state/entities", { spy: true });
vi.mock("../hooks/useThreadRouteTarget", { spy: true });
vi.mock("../hooks/useHandleNewThread", { spy: true });
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

describe("sidebar header new thread", () => {
  it.each([
    { mode: "normal", count: 2, shift: false, picker: true },
    { mode: "boring", count: 2, shift: false, picker: true },
    { mode: "boring", count: 2, shift: true, picker: false },
    { mode: "boring", count: 1, shift: false, picker: false },
  ] as const)("$mode sidebar, $count projects, shift=$shift: picker=$picker", async (scenario) => {
    using stack = new DisposableStack();
    const previousSettings = getClientSettings();
    stack.defer(() => __setClientSettingsForTests(previousSettings));
    __setClientSettingsForTests({
      ...DEFAULT_CLIENT_SETTINGS,
      boringSidebarEnabled: scenario.mode === "boring",
    });
    const projects = [project("active"), project("idle")].slice(0, scenario.count);
    const currentProjectRef = {
      environmentId: projects[0]!.environmentId,
      projectId: projects[0]!.id,
    };
    const startThread = vi.fn().mockResolvedValue(null);
    vi.mocked(useProjects).mockReturnValue(projects);
    vi.mocked(useHandleNewThread).mockReturnValue({
      activeDraftThread: null,
      activeThread: null,
      defaultProjectRef: currentProjectRef,
      defaultProjectFallbackReady: true,
      handleNewThread: startThread,
      routeDraftId: null,
      routeThreadRef: null,
    });
    vi.mocked(openCommandPalette).mockClear();
    await using screen = await render(
      <SidebarProvider>
        <Sidebar routeReveal={{ observedKey: null, pendingKey: null }} />
      </SidebarProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "New thread", exact: true }), {
      modifiers: scenario.shift ? ["Shift"] : [],
    });

    if (scenario.picker) {
      expect(openCommandPalette).toHaveBeenCalledExactlyOnceWith({ open: "new-thread-in" });
      expect(startThread).not.toHaveBeenCalled();
    } else {
      expect(openCommandPalette).not.toHaveBeenCalled();
      expect(startThread).toHaveBeenCalledExactlyOnceWith(currentProjectRef);
    }
  });
});

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
    await userEvent.click(screen.getByRole("button", { name: /^Grandchild,/ }));
    await vi.waitFor(() =>
      expect(screen.router!.state.location.pathname).toBe("/local/Grandchild"),
    );
  });
});
