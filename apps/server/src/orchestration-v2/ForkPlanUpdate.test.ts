import { CommandId, RunId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildMcpPlan } from "./ForkPlanUpdate.ts";

const command = (runId: string, text: string) => ({
  type: "thread.plan.update" as const,
  commandId: CommandId.make("cmd-1"),
  threadId: ThreadId.make("thread-1"),
  runId: RunId.make(runId),
  steps: [{ id: "U1", text, status: "running" as const }],
  explanation: "[Plan](https://example.com/plan)",
});

describe("buildMcpPlan", () => {
  it("builds an active todo_list with the steps", () => {
    const plan = buildMcpPlan(command("run-1", "First"));
    expect(plan).toMatchObject({
      kind: "todo_list",
      status: "active",
      runId: "run-1",
      steps: [{ id: "U1", text: "First", status: "running" }],
      explanation: "[Plan](https://example.com/plan)",
    });
  });

  it("keeps the plan id for the same run and replaces the steps", () => {
    const first = buildMcpPlan(command("run-1", "First"));
    const second = buildMcpPlan(command("run-1", "Second"));
    expect(second.id).toBe(first.id);
    expect(second.nodeId).toBe(first.nodeId);
    expect(second.steps[0]?.text).toBe("Second");
  });

  it("gives another run its own plan", () => {
    expect(buildMcpPlan(command("run-2", "First")).id).not.toBe(
      buildMcpPlan(command("run-1", "First")).id,
    );
  });
});
