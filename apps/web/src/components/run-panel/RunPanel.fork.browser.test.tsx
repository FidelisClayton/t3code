import { EnvironmentId, NodeId, PlanId, RunId, ThreadId } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";

import { render } from "../../../test/render";
import { RunPanelView } from "./RunPanel";

it("links the plan's source from its explanation", async () => {
  const threadRef = { environmentId: EnvironmentId.make("local"), threadId: ThreadId.make("t") };
  const runId = RunId.make("plan-run");
  await using screen = await render(
    <RunPanelView
      threadRef={threadRef}
      model={{
        rows: [],
        pendingRequests: { approvals: [], userInputs: [] },
        plan: {
          id: PlanId.make("plan"),
          threadId: threadRef.threadId,
          runId,
          nodeId: NodeId.make("plan"),
          kind: "todo_list",
          status: "active",
          explanation: "[Sidebar plan progress](https://example.com/plans/sidebar.md)",
          steps: [{ id: "U1", text: "Plan update command", status: "running" }],
        },
      }}
      status="live"
      connected
      error={null}
      onRespondInChat={() => {}}
      renderChild={() => null}
      renderParent={() => null}
    />,
  );
  await expect
    .element(screen.getByRole("link", { name: "Sidebar plan progress" }))
    .toHaveAttribute("href", "https://example.com/plans/sidebar.md");
});
