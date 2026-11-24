import { describe, expect, it } from "vite-plus/test";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { FORK_ORCHESTRATION_V2_WS_METHODS } from "./forkOrchestrationV2.ts";
import { WsRpcGroup } from "./rpc.ts";

describe("fork WebSocket RPC contracts", () => {
  it("bounds Markdown reference IDs at the read RPC boundary", () => {
    const request = WsRpcGroup.requests.get(FORK_ORCHESTRATION_V2_WS_METHODS.getMarkdownReference);
    if (request === undefined) throw new Error("getMarkdownReference is not registered");
    const decode = Schema.decodeUnknownExit(request.payloadSchema);
    expect(Exit.isSuccess(decode({ threadId: "thread-1", id: "linear/E-406" }))).toBe(true);
    for (const id of ["linear/a/b", "linear/E-406\n", "linear/" + "a".repeat(65)]) {
      expect(Exit.isFailure(decode({ threadId: "thread-1", id }))).toBe(true);
    }
  });
});
