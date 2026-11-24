import { assert, describe, it } from "@effect/vitest";

import { buildRuntimeInstructions } from "./runtimeInstructions.ts";

describe("buildRuntimeInstructions", () => {
  it.each([
    { pullRequestLinking: undefined, chatMarkdown: undefined },
    { pullRequestLinking: false, chatMarkdown: undefined },
    { pullRequestLinking: undefined, chatMarkdown: false },
    { pullRequestLinking: false, chatMarkdown: false },
  ])(
    "keeps runtime identity with PR linking $pullRequestLinking and chat guidance $chatMarkdown",
    ({ pullRequestLinking, chatMarkdown }) => {
      const instructions = buildRuntimeInstructions({
        harness: "Antigravity",
        model: "gemini-3.8-flash",
        ...(pullRequestLinking === undefined ? {} : { pullRequestLinking }),
        ...(chatMarkdown === undefined ? {} : { chatMarkdown }),
      });

      assert.include(instructions, "through the Antigravity harness, as gemini-3.8-flash.");
      assert.lengthOf(instructions.split("## Chat components"), chatMarkdown === false ? 1 : 2);
      assert.equal(instructions.includes("<pull_request_linking>"), pullRequestLinking !== false);
    },
  );
});
