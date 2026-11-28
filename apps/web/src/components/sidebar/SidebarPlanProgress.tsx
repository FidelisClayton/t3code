import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { threadRuntimeIsActive } from "@t3tools/client-runtime/state/models";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useGT } from "gt-react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { useRightPanelStore } from "../../rightPanelStore";
import type { SidebarThreadSummary } from "../../types";

/** Fork: a card row's plan line, `3/10 · U3 Plan agent · 2 agents`, that opens the Run panel. */
export function SidebarPlanProgress(props: {
  thread: Pick<
    SidebarThreadSummary,
    "environmentId" | "id" | "planProgress" | "pendingBackgroundTasks" | "runtime"
  >;
  isRouteThread: boolean;
  onThreadActivate: (threadRef: ScopedThreadRef) => void;
}) {
  const gt = useGT();
  const progress = props.thread.planProgress;
  if (!progress || progress.completed >= progress.total) return null;
  const agents = props.thread.pendingBackgroundTasks.filter(
    (task) => task.kind === "subagent",
  ).length;
  // A thread parked at idle on delegates still has a live plan; other background work (PR watches) does not hold it.
  if (!threadRuntimeIsActive(props.thread.runtime) && agents === 0) return null;
  const { completed, total, current } = progress;
  const label =
    current === null
      ? gt(
          "Open Run: {completed} of {total} plan steps done{agents, plural, =0 {} one {, {agents} agent running} other {, {agents} agents running}}",
          { completed, total, agents },
        )
      : gt(
          "Open Run: {completed} of {total} plan steps done, now {current}{agents, plural, =0 {} one {, {agents} agent running} other {, {agents} agents running}}",
          { completed, total, current, agents },
        );
  const handleClick = (event: ReactMouseEvent) => {
    // The row's click handler would navigate a second time.
    event.stopPropagation();
    const threadRef = scopeThreadRef(props.thread.environmentId, props.thread.id);
    useRightPanelStore.getState().open(threadRef, "run");
    if (!props.isRouteThread) props.onThreadActivate(threadRef);
  };
  return (
    <button
      type="button"
      aria-label={label}
      data-testid="sidebar-plan-progress"
      onClick={handleClick}
      className="relative z-10 -mbs-1 flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-(--sidebar-row-content-inset) pbe-(--sidebar-content-inset) text-start text-xs text-secondary-label focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring active:text-foreground pointer-fine:hover:text-foreground"
    >
      <span aria-hidden className="h-1 w-6 shrink-0 overflow-clip rounded-full bg-current/20">
        <span
          className="block h-full rounded-full bg-current"
          style={{ inlineSize: `${(completed / total) * 100}%` }}
        />
      </span>
      <span className="shrink-0 tabular-nums">
        {completed}/{total}
      </span>
      {current === null ? null : (
        <>
          <span aria-hidden>·</span>
          <span dir="auto" className="min-w-0 truncate">
            {current}
          </span>
        </>
      )}
      {agents > 0 ? (
        <>
          <span aria-hidden>·</span>
          <span className="shrink-0 tabular-nums">
            {gt("{count, plural, one {{count} agent} other {{count} agents}}", { count: agents })}
          </span>
        </>
      ) : null}
    </button>
  );
}
