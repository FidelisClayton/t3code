import { describe, expect, it } from "vite-plus/test";
import {
  EnvironmentId,
  MessageId,
  NodeId,
  PlanId,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderSessionId,
  RunId,
  RuntimeRequestId,
  ThreadId,
  TurnItemId,
  type OrchestrationV2Run,
  type OrchestrationV2Subagent,
  type OrchestrationV2PlanArtifact,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { makeThreadFixture, makeThreadProjectionFixture } from "../../test-fixtures";
import { deriveRunPanelModel } from "./runPanelModel";

const environmentId = EnvironmentId.make("local");
const now = DateTime.makeUnsafe("2026-11-10T00:00:00Z");
function run(ordinal: number, status: OrchestrationV2Run["status"]): OrchestrationV2Run {
  const projection = makeThreadProjectionFixture();
  return {
    id: RunId.make(`run-${ordinal}`),
    threadId: projection.thread.id,
    ordinal,
    providerInstanceId: projection.thread.providerInstanceId,
    modelSelection: projection.thread.modelSelection,
    providerThreadId: null,
    userMessageId: MessageId.make(`message-${ordinal}`),
    rootNodeId: null,
    activeAttemptId: null,
    status,
    requestedAt: now,
    startedAt: status === "queued" ? null : now,
    completedAt: null,
    checkpointId: null,
    contextHandoffId: null,
  };
}
function agent(overrides: Partial<OrchestrationV2Subagent> = {}): OrchestrationV2Subagent {
  return {
    id: NodeId.make("worker"),
    threadId: ThreadId.make("thread-test"),
    runId: RunId.make("run-1"),
    parentNodeId: NodeId.make("root"),
    origin: "provider_native",
    createdBy: "agent",
    driver: ProviderDriverKind.make("codex"),
    providerInstanceId: ProviderInstanceId.make("codex"),
    providerThreadId: null,
    childThreadId: null,
    nativeTaskRef: null,
    prompt: "Verify",
    title: "Verifier",
    model: null,
    status: "running",
    result: null,
    startedAt: now,
    completedAt: null,
    updatedAt: now,
    ...overrides,
  };
}
function plan(
  id: string,
  ordinal: number,
  status: OrchestrationV2PlanArtifact["status"] = "active",
): OrchestrationV2PlanArtifact {
  return {
    id: PlanId.make(id),
    threadId: ThreadId.make("thread-test"),
    runId: RunId.make(`run-${ordinal}`),
    nodeId: NodeId.make(id),
    kind: "todo_list",
    status,
    steps: [{ id: "verify", text: id, status: "pending" }],
  };
}
function input() {
  return { environmentId, projection: makeThreadProjectionFixture(), shells: [] };
}

describe("deriveRunPanelModel", () => {
  it("orders actual executions and keeps failure outcomes distinct from completed", () => {
    const base = input();
    const model = deriveRunPanelModel({
      ...base,
      projection: {
        ...base.projection,
        runs: [run(4, "queued"), run(2, "completed"), run(3, "waiting")],
        subagents: [
          agent({ id: NodeId.make("failed"), runId: RunId.make("run-3"), status: "failed" }),
          agent({ id: NodeId.make("cancelled"), runId: RunId.make("run-3"), status: "cancelled" }),
          agent({
            id: NodeId.make("interrupted"),
            runId: RunId.make("run-3"),
            status: "interrupted",
          }),
        ],
      },
    });
    expect(
      model.rows.filter((row) => row.kind === "parent").map(({ status, group }) => [status, group]),
    ).toEqual([
      ["waiting", "working"],
      ["queued", "upNext"],
    ]);
    expect(
      model.rows
        .filter((row) => row.kind === "subagent")
        .map(({ status, group }) => [status, group]),
    ).toEqual([
      ["failed", "attention"],
      ["interrupted", "attention"],
      ["cancelled", "finished"],
    ]);
  });

  it.each(["live", "message", "not_resumable"] as const)(
    "only treats actionable %s input as attention",
    (capability) => {
      const base = input();
      const requestId = RuntimeRequestId.make("question");
      const model = deriveRunPanelModel({
        ...base,
        projection: {
          ...base.projection,
          runs: [run(1, "waiting")],
          runtimeRequests: [
            {
              id: requestId,
              nodeId: NodeId.make("question"),
              providerTurnId: null,
              nativeRequestRef: null,
              kind: "user_input",
              status: "pending",
              createdAt: now,
              resolvedAt: null,
              responseCapability:
                capability === "live"
                  ? { type: "live", providerSessionId: ProviderSessionId.make("session") }
                  : capability === "message"
                    ? { type: "message" }
                    : { type: "not_resumable", reason: "Ended" },
            },
          ],
          turnItems: [
            {
              id: TurnItemId.make("question"),
              threadId: base.projection.thread.id,
              runId: RunId.make("run-1"),
              nodeId: NodeId.make("question"),
              providerThreadId: null,
              providerTurnId: null,
              nativeItemRef: null,
              parentItemId: null,
              ordinal: 1,
              status: "completed",
              title: null,
              startedAt: now,
              completedAt: now,
              updatedAt: now,
              type: "user_input_request",
              requestId,
              questions: [],
            },
          ],
        },
      });
      expect(model.rows[0]?.group).toBe(capability === "not_resumable" ? "working" : "attention");
      expect(model.pendingRequests.userInputs).toHaveLength(1);
    },
  );

  it("selects plans by run ordinal and artifact order, excluding superseded and rolled back plans", () => {
    const base = input();
    const projection = {
      ...base.projection,
      runs: [run(3, "running"), run(2, "completed"), run(1, "completed"), run(4, "rolled_back")],
      plans: [
        plan("new", 2),
        plan("old", 1),
        plan("newer", 2),
        plan("superseded", 3, "superseded"),
        plan("rollback", 4),
      ],
    };
    expect(deriveRunPanelModel({ ...base, projection }).plan?.id).toBe("newer");
    expect(
      deriveRunPanelModel({
        ...base,
        projection: { ...projection, runs: [run(5, "running"), ...projection.runs] },
      }).plan?.id,
    ).toBe("newer");
  });

  it("retains historical created threads and drops them when their source run rolls back", () => {
    const base = input();
    const childId = ThreadId.make("historical-child");
    const createdThreads = [{ threadId: childId, runId: RunId.make("run-1") }];
    const projection = { ...base.projection, runs: [run(1, "completed"), run(2, "running")] };
    const shells = [makeThreadFixture({ environmentId, id: childId, title: "Earlier child" })];
    const historical = deriveRunPanelModel({ ...base, projection, shells, createdThreads });
    expect(
      historical.rows.filter((row) => row.kind === "child").map((row) => row.thread?.threadId),
    ).toEqual([childId]);
    const rolledBack = deriveRunPanelModel({
      ...base,
      projection: { ...projection, runs: [run(1, "rolled_back"), run(2, "running")] },
      shells,
      createdThreads,
    });
    expect(rolledBack.rows.filter((row) => row.kind === "child")).toEqual([]);
  });

  it("keeps linked children across parent turns, deduplicates agents and scopes matching IDs", () => {
    const base = input();
    const childId = ThreadId.make("child");
    const shell = makeThreadFixture({
      environmentId,
      id: childId,
      title: "Child",
      runtime: {
        status: "running",
        activeRunId: RunId.make("child-run"),
        providerInstanceId: ProviderInstanceId.make("codex"),
        providerName: "codex",
        lastError: null,
        updatedAt: "2026-11-10T00:00:00Z",
      },
      lineage: {
        rootThreadId: base.projection.thread.id,
        parentThreadId: base.projection.thread.id,
        relationshipToParent: "subagent",
      },
      latestRun: {
        runId: RunId.make("child-run"),
        status: "running",
        requestedAt: null,
        startedAt: null,
        completedAt: null,
        assistantMessageId: null,
      },
    });
    const model = deriveRunPanelModel({
      ...base,
      projection: {
        ...base.projection,
        runs: [run(1, "completed"), run(2, "running")],
        subagents: [
          agent({ childThreadId: childId, progress: "Checking", result: "Actual result" }),
          agent({
            id: NodeId.make("remote"),
            remoteChild: {
              environmentId: EnvironmentId.make("remote"),
              threadId: childId,
              label: "Remote",
            },
          }),
          agent({ id: NodeId.make("native") }),
        ],
      },
      shells: [shell],
    });
    const children = model.rows.filter((row) => row.thread?.threadId === childId);
    expect(children).toHaveLength(2);
    expect(new Set(children.map((row) => row.key)).size).toBe(2);
    expect(children.find((row) => row.thread?.environmentId === environmentId)).toMatchObject({
      group: "working",
      progress: "Checking",
      result: "Actual result",
    });
    expect(children.find((row) => row.thread?.environmentId === "remote")).toMatchObject({
      status: "unavailable",
      group: "unavailable",
    });
    expect(model.rows.some((row) => row.kind === "subagent" && row.title === "Verifier")).toBe(
      true,
    );
  });

  it("uses thread_created associations without inventing completion for missing shells", () => {
    const base = input();
    const model = deriveRunPanelModel({
      ...base,
      projection: {
        ...base.projection,
        runs: [run(1, "completed")],
        turnItems: [
          {
            id: TurnItemId.make("created"),
            threadId: base.projection.thread.id,
            runId: RunId.make("run-1"),
            nodeId: null,
            providerThreadId: null,
            providerTurnId: null,
            nativeItemRef: null,
            parentItemId: null,
            ordinal: 1,
            status: "completed",
            title: null,
            startedAt: now,
            completedAt: now,
            updatedAt: now,
            type: "thread_created",
            targetThreadId: ThreadId.make("created-child"),
            targetRunId: null,
            targetProviderInstanceId: base.projection.thread.providerInstanceId,
            targetModel: "codex",
          },
        ],
      },
    });
    expect(model.rows.find((row) => row.kind === "child")).toMatchObject({
      status: "unavailable",
      group: "unavailable",
    });
  });
  it.each(["live", "not_resumable"] as const)(
    "only treats %s approvals as actionable",
    (capability) => {
      const base = input();
      const model = deriveRunPanelModel({
        ...base,
        projection: {
          ...base.projection,
          runs: [run(1, "running")],
          runtimeRequests: [
            {
              id: RuntimeRequestId.make("approval"),
              nodeId: NodeId.make("approval"),
              providerTurnId: null,
              nativeRequestRef: null,
              kind: "command",
              status: "pending",
              createdAt: now,
              resolvedAt: null,
              responseCapability:
                capability === "live"
                  ? { type: "live", providerSessionId: ProviderSessionId.make("session") }
                  : { type: "not_resumable", reason: "Ended" },
            },
          ],
        },
      });
      expect(model.rows[0]?.group).toBe(capability === "live" ? "attention" : "working");
    },
  );

  it.each(["completed", "failed", "interrupted", "cancelled"] as const)(
    "retains the latest %s native cohort across turns and excludes rolled back agents",
    (status) => {
      const base = input();
      const model = deriveRunPanelModel({
        ...base,
        projection: {
          ...base.projection,
          runs: [
            run(1, "completed"),
            run(2, "completed"),
            run(3, "running"),
            run(4, "rolled_back"),
          ],
          subagents: [
            agent({ id: NodeId.make("old"), status: "completed", result: "Old" }),
            agent({
              id: NodeId.make("settled"),
              runId: RunId.make("run-2"),
              status,
              result: "Saved result",
              updatedAt: DateTime.add(now, { seconds: 1 }),
            }),
            agent({ id: NodeId.make("rollback"), runId: RunId.make("run-4"), status: "running" }),
          ],
        },
      });
      expect(model.rows.filter((row) => row.kind === "subagent")).toMatchObject([
        {
          status,
          result: "Saved result",
          group: status === "failed" || status === "interrupted" ? "attention" : "finished",
        },
      ]);
    },
  );

  it("shows shell requests as inspection hints and does not mistake waiting on a child for user input", () => {
    const base = input();
    const shell = makeThreadFixture({
      environmentId,
      id: ThreadId.make("waiting-child"),
      lineage: {
        parentThreadId: base.projection.thread.id,
        rootThreadId: base.projection.thread.id,
        relationshipToParent: "subagent",
      },
      blockedOnThreadWait: true,
    });
    expect(deriveRunPanelModel({ ...base, shells: [shell] }).rows[0]).toMatchObject({
      group: "unavailable",
      status: "unavailable",
    });
    expect(
      deriveRunPanelModel({ ...base, shells: [{ ...shell, hasPendingUserInput: true }] }).rows[0],
    ).toMatchObject({ group: "attention", pendingRequestHint: "user_input" });
  });
  it("uses reordered queue positions and recovers plan detail stored in a turn item", () => {
    const base = input();
    const artifact = {
      ...plan("proposal", 1, "completed"),
      kind: "proposed_plan" as const,
      markdown: "",
      detailInTurnItem: true as const,
    };
    const model = deriveRunPanelModel({
      ...base,
      projection: {
        ...base.projection,
        runs: [
          run(1, "completed"),
          { ...run(2, "queued"), queuePosition: 2 },
          { ...run(3, "queued"), queuePosition: 1 },
        ],
        plans: [artifact],
        turnItems: [
          {
            id: TurnItemId.make("proposal"),
            threadId: base.projection.thread.id,
            runId: RunId.make("run-1"),
            nodeId: null,
            providerThreadId: null,
            providerTurnId: null,
            nativeItemRef: null,
            parentItemId: null,
            ordinal: 1,
            status: "completed",
            title: null,
            startedAt: now,
            completedAt: now,
            updatedAt: now,
            type: "proposed_plan",
            streaming: false,
            planId: artifact.id,
            markdown: "Saved plan",
          },
        ],
      },
    });
    expect(model.plan).toMatchObject({ markdown: "Saved plan" });
    expect(model.rows.filter((row) => row.group === "upNext").map((row) => row.key)).toEqual([
      JSON.stringify([environmentId, base.projection.thread.id, "run", "run-3"]),
      JSON.stringify([environmentId, base.projection.thread.id, "run", "run-2"]),
    ]);
  });
});
