import {
  ORCHESTRATION_V2_PLAN_MAX_STEPS,
  OrchestrationV2PlanStep,
  OrchestratorMcpFailure,
} from "@t3tools/contracts";
import * as Struct from "effect/Struct";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Schema from "effect/Schema";
import { McpSchema, Tool, Toolkit } from "effect/ai";

import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const T3_PLAN_UPDATE_TOOL_NAME = "t3_plan_update";

// It records progress on the caller's own thread only, so read-only sandboxes and plan mode may use it.
const PlanUpdateTool = Tool.make(T3_PLAN_UPDATE_TOOL_NAME, {
  description:
    "Record progress on a plan of 3+ steps. Call it at the start with every step, and again when a step starts or finishes; send the whole list each time. Use the plan's unit ids (U1, U2) as step ids. Pass `source` when the plan lives in a file with a URL. Codex uses `update_plan` instead. Subagents and delegated helpers do not call it; the top-level agent owns the thread's plan.",
  parameters: Schema.Struct({
    steps: Schema.Array(
      Schema.Struct(Struct.pick(OrchestrationV2PlanStep.fields, ["id", "text", "status"])),
    ).check(Schema.isMinLength(1), Schema.isMaxLength(ORCHESTRATION_V2_PLAN_MAX_STEPS)),
    source: Schema.optional(Schema.Struct({ title: Schema.String, url: Schema.String })),
  }),
  success: Schema.Struct({ steps: Schema.Number }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    SecureRandom.SecureRandom,
    ThreadManagementService.ThreadManagementService,
  ],
})
  .annotate(Tool.Title, "Update plan progress")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false)
  .annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenFromOutsideClients);

export const PlanToolkit = Toolkit.make(PlanUpdateTool);
