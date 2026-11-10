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

  it("links PRs the agent creates, takes over, or pushes to, and no others", () => {
    const instructions = buildRuntimeInstructions({ harness: "Codex" });

    assert.include(instructions, "Link each PR you create, take over, or push to");
    assert.include(instructions, "every stack layer");
    assert.include(instructions, "Skip PRs you only read or review");
    assert.include(instructions, "If linking fails, say so.");
    assert.notInclude(instructions, "git log -1");
    assert.notInclude(instructions, "work on");
    // Listing linked PRs as an end-of-work check found nothing to add in audited threads.
    assert.notInclude(instructions, "list_thread_pull_requests");
  });

  it("waits on a PR only with the watch, never with a poll loop", () => {
    const instructions = buildRuntimeInstructions({ harness: "Codex" });

    assert.notInclude(instructions, "Creation, pending checks, or a merge ask alone is not enough");
    assert.include(instructions, "Links and watches persist across pushes.");
    // The wake message itself carries the do-not-re-watch rule.
    assert.notInclude(instructions, "On a wake");
    assert.include(
      instructions,
      "Call watch_pull_request when asked to monitor or babysit, or when work you were asked to do, such as a merge, still waits on checks or reviews, even after an earlier unwatch",
    );
    assert.notInclude(instructions, "merge it now");
    assert.include(instructions, "Otherwise act now or hand back.");
    assert.include(instructions, "then watch and end your turn");
    assert.include(instructions, "never watch, even if the brief says babysit");
    assert.include(
      instructions,
      "After PR work, a child's last line is: PR <full URL>, head <SHA>, checks and reviews <state>.",
    );
    assert.include(
      instructions,
      "For PR waits, no sleep, loops, gh --watch, Monitor or ScheduleWakeup.",
    );
    assert.include(instructions, "call unwatch_pull_request");
  });
});
