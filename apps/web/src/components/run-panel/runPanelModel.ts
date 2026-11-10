import * as DateTime from "effect/DateTime";
import { threadKey } from "@t3tools/client-runtime/state/entities";
import { resolveActiveThreadRun } from "@t3tools/client-runtime/state/thread-workflows";
import { isTerminalSubagentStatus } from "@t3tools/client-runtime/state/subagentRuntime";
import { deriveThreadTurnSubagents } from "@t3tools/client-runtime/state/thread-subagents";
import { formatSubagentDisplayTitle } from "@t3tools/client-runtime/state/subagent-display";
import type {
  EnvironmentId,
  OrchestrationV2PlanArtifact,
  OrchestrationV2RunStatus,
  OrchestrationV2Subagent,
  ScopedThreadRef,
  RunId,
} from "@t3tools/contracts";
import type { EnvironmentThreadShell, ThreadStructure } from "@t3tools/client-runtime/state/models";
import {
  derivePendingThreadRequests,
  type PendingThreadRequests,
} from "@t3tools/client-runtime/state/thread-requests";

export type RunPanelGroup = "attention" | "working" | "upNext" | "finished" | "unavailable";
export interface RunPanelRow {
  readonly key: string;
  readonly runId?: RunId;
  readonly kind: "parent" | "child" | "subagent";
  readonly title: string;
  readonly status: OrchestrationV2RunStatus | OrchestrationV2Subagent["status"] | "unavailable";
  readonly group: RunPanelGroup;
  readonly thread?: ScopedThreadRef;
  readonly progress?: string;
  readonly detail?: string;
  readonly result?: string;
  readonly steps?: Extract<OrchestrationV2PlanArtifact, { kind: "todo_list" }>["steps"];
  /** A shell hint needs detail inspection before offering any response action. */
  readonly pendingRequestHint?: "approval" | "user_input";
}
export interface RunPanelModel {
  readonly rows: ReadonlyArray<RunPanelRow>;
  readonly plan: OrchestrationV2PlanArtifact | null;
  readonly pendingRequests: PendingThreadRequests;
}
export interface RunPanelInput {
  readonly environmentId: EnvironmentId;
  readonly projection: Pick<
    ThreadStructure,
    "thread" | "runs" | "subagents" | "plans" | "runtimeRequests" | "turnItems"
  >;
  readonly shells: ReadonlyArray<EnvironmentThreadShell>;
  readonly createdThreads?: ReadonlyArray<{
    readonly threadId: ScopedThreadRef["threadId"];
    readonly runId: RunId | null;
  }>;
}
export function deriveRunPanelModel(input: RunPanelInput): RunPanelModel {
  const { environmentId, projection, shells } = input;
  const runs = projection.runs
    .filter((run) => run.status !== "rolled_back")
    .toSorted((left, right) => left.ordinal - right.ordinal);
  const runById = new Map(projection.runs.map((run) => [run.id, run]));
  const rolledBack = (runId: OrchestrationV2Subagent["runId"]) =>
    runId !== null && runById.get(runId)?.status === "rolled_back";
  const pendingRequests = derivePendingThreadRequests(projection);
  const actionable =
    pendingRequests.approvals.some((request) => request.responseCapability === "live") ||
    pendingRequests.userInputs.some((request) => request.responseCapability !== "not_resumable");
  let plan: OrchestrationV2PlanArtifact | null = null;
  for (const candidate of projection.plans) {
    if (candidate.status === "superseded" || rolledBack(candidate.runId)) continue;
    const ordinal = candidate.runId === null ? -1 : (runById.get(candidate.runId)?.ordinal ?? -1);
    const previousOrdinal = plan?.runId == null ? -1 : (runById.get(plan.runId)?.ordinal ?? -1);
    if (plan === null || ordinal >= previousOrdinal) plan = candidate;
  }
  if (plan?.detailInTurnItem) {
    const item = projection.turnItems.findLast(
      (item) =>
        (item.type === "proposed_plan" || item.type === "todo_list") && item.planId === plan?.id,
    );
    if (plan.kind === "proposed_plan" && item?.type === "proposed_plan")
      plan = { ...plan, markdown: item.markdown };
    if (plan.kind === "todo_list" && item?.type === "todo_list")
      plan = {
        ...plan,
        steps: item.steps,
        ...(item.explanation === undefined ? {} : { explanation: item.explanation }),
      };
  }
  const rows: RunPanelRow[] = [];
  const parent = { environmentId, threadId: projection.thread.id };
  const active = resolveActiveThreadRun({ runs });
  const latest = runs.findLast((run) => run.status !== "queued") ?? null;
  const presented = active ?? latest;
  for (const run of runs.toSorted(
    (left, right) => (left.queuePosition ?? left.ordinal) - (right.queuePosition ?? right.ordinal),
  )) {
    if (run !== presented && run.status !== "queued") continue;
    rows.push({
      key: JSON.stringify([environmentId, parent.threadId, "run", run.id]),
      kind: "parent",
      runId: run.id,
      title: projection.thread.title,
      status: run.status,
      group: run === presented && actionable ? "attention" : statusGroup(run.status),
      thread: parent,
      ...(run === presented && plan?.kind === "todo_list" ? { steps: plan.steps } : {}),
    });
  }
  if (presented === null && actionable)
    rows.push({
      key: JSON.stringify([environmentId, parent.threadId, "requests"]),
      kind: "parent",
      title: projection.thread.title,
      status: "unavailable",
      group: "attention",
      thread: parent,
    });

  const shellByKey = new Map(
    shells.map((shell) => [
      threadKey({ environmentId: shell.environmentId, threadId: shell.id }),
      shell,
    ]),
  );
  const linked = new Map<string, { thread: ScopedThreadRef; agent?: OrchestrationV2Subagent }>();
  const eligible = projection.subagents.filter((agent) => !rolledBack(agent.runId));
  for (const agent of eligible) {
    const thread = agent.remoteChild
      ? { environmentId: agent.remoteChild.environmentId, threadId: agent.remoteChild.threadId }
      : agent.childThreadId === null
        ? null
        : { environmentId, threadId: agent.childThreadId };
    if (thread === null) continue;
    const key = threadKey(thread);
    const previous = linked.get(key)?.agent;
    if (
      previous === undefined ||
      DateTime.toEpochMillis(agent.updatedAt) >= DateTime.toEpochMillis(previous.updatedAt)
    )
      linked.set(key, { thread, agent });
  }
  for (const item of projection.turnItems) {
    if (item.type !== "thread_created" || rolledBack(item.runId)) continue;
    const thread = { environmentId, threadId: item.targetThreadId };
    const key = threadKey(thread);
    if (!linked.has(key)) linked.set(key, { thread });
  }
  for (const created of input.createdThreads ?? []) {
    if (rolledBack(created.runId)) continue;
    const thread = { environmentId, threadId: created.threadId };
    const key = threadKey(thread);
    if (!linked.has(key)) linked.set(key, { thread });
  }
  for (const shell of shells) {
    const localChild =
      shell.environmentId === environmentId &&
      shell.lineage.parentThreadId === parent.threadId &&
      shell.lineage.relationshipToParent === "subagent";
    const remoteChild =
      shell.delegatedFrom?.environmentId === environmentId &&
      shell.delegatedFrom.threadId === parent.threadId;
    if (!localChild && !remoteChild) continue;
    const thread = { environmentId: shell.environmentId, threadId: shell.id };
    const key = threadKey(thread);
    if (!linked.has(key)) linked.set(key, { thread });
  }
  for (const [key, { thread, agent }] of linked) {
    const shell = shellByKey.get(key);
    const status = shell?.runtime?.status ?? shell?.latestRun?.status ?? "unavailable";
    const pendingRequestHint = shell?.hasPendingApprovals
      ? "approval"
      : shell?.hasPendingUserInput
        ? "user_input"
        : undefined;
    rows.push({
      key: JSON.stringify([environmentId, parent.threadId, "child", key]),
      kind: "child",
      title: formatSubagentDisplayTitle(
        agent?.title ?? shell?.title ?? agent?.remoteChild?.label ?? "Child thread",
      ),
      status,
      group: pendingRequestHint ? "attention" : statusGroup(status),
      thread,
      ...(pendingRequestHint ? { pendingRequestHint } : {}),
      ...(agent?.progress ? { progress: agent.progress } : {}),
      ...(agent?.prompt ? { detail: agent.prompt } : {}),
      ...(agent?.result ? { result: agent.result } : {}),
    });
  }
  const roster = deriveThreadTurnSubagents({ runs, subagents: eligible })?.subagents ?? [];
  const latestTerminal = eligible
    .filter((agent) => isTerminalSubagentStatus(agent.status))
    .toSorted(
      (left, right) =>
        DateTime.toEpochMillis(right.updatedAt) - DateTime.toEpochMillis(left.updatedAt),
    )[0];
  const visible = new Set(roster.map((agent) => agent.id));
  for (const agent of eligible) {
    if (agent.childThreadId !== null || agent.remoteChild !== undefined) continue;
    if (
      !visible.has(agent.id) &&
      (latestTerminal === undefined || agent.runId !== latestTerminal.runId)
    )
      continue;
    rows.push({
      key: JSON.stringify([environmentId, parent.threadId, "subagent", agent.id]),
      kind: "subagent",
      title: formatSubagentDisplayTitle(agent.title ?? "Subagent"),
      status: agent.status,
      group: statusGroup(agent.status),
      ...(agent.progress ? { progress: agent.progress } : {}),
      ...(agent.prompt ? { detail: agent.prompt } : {}),
      ...(agent.result ? { result: agent.result } : {}),
    });
  }
  return {
    rows: rows.sort((left, right) => GROUP_ORDER[left.group] - GROUP_ORDER[right.group]),
    plan,
    pendingRequests,
  };
}

const GROUP_ORDER: Record<RunPanelGroup, number> = {
  attention: 0,
  working: 1,
  upNext: 2,
  unavailable: 3,
  finished: 4,
};
function statusGroup(status: RunPanelRow["status"]): RunPanelGroup {
  switch (status) {
    case "failed":
    case "interrupted":
      return "attention";
    case "preparing":
    case "starting":
    case "running":
    case "waiting":
      return "working";
    case "pending":
    case "queued":
      return "upNext";
    case "idle":
    case "unavailable":
    case "rolled_back":
      return "unavailable";
    default:
      return "finished";
  }
}
