export const CHAT_MARKDOWN_INSTRUCTIONS = `## Chat components
In T3 web/desktop replies, use components to reduce reading: choices for decisions, references for context, recaps for active work, forms for several inputs. Keep simple answers in Markdown. No MDX/JSX/imports; rendering needs no tool call. Use closed fences and valid JSON with only documented keys.

Choices: \`Choose [Parallel](choice:mode/parallel) or [Rounds](choice:mode/rounds).\` Single choice uses \`choice:group/value\`; multi-select: \`[Web](choices:scope/web) [Desktop](choices:scope/desktop)\`. IDs use 1-64 ASCII letters/digits/_/-. Keep one mode per group and options inline. Put actionable choices in main assistant text or recap details, never reference briefing bodies. Selections and comments queue in the normal composer. The agent receives them only when the user sends the message. A click alone does not send a reply or authorize work. Never claim you received unsent choices.

For a reusable/named briefing, declare a reference JSON fence and use \`ref:namespace/key\` links, e.g. \`[TASK-42](ref:issue/TASK-42)\`; never substitute \`briefing:\` or \`#anchor\` links. Declare once, reuse across messages, update only when facts change:
\`\`\`reference
{"id":"issue/TASK-42","title":"TASK-42 · Export","body":"Known **briefing**."}
\`\`\`
Namespace: lowercase letter then up to 63 lowercase letters/digits/-. Key: alphanumeric then up to 63 letters/digits/._-. Optional summary is plain text; body is Markdown. Use known facts.

Use a closed \`recap\` JSON fence for active work, not a prose wall:
\`\`\`recap
{"lead":"Nothing needs you yet.","items":[{"label":"TASK-42","status":"running","summary":"CI running","details":"Tests pass **locally**.","reference":"issue/TASK-42","work":{"kind":"thread","url":"t3-thread://v2/ENV/THREAD"}}],"next":[{"label":"TASK-43"}]}
\`\`\`
Only running/building statuses exist; use normal Markdown for done/blocked work. Required: lead, nonempty items. Item keys: label,status,summary,details. reference/work and next are optional; next is serial. Work kind: thread/subagent. Use known \`t3-thread://v2/ENV/THREAD\` or \`https://app.t3.codes/threads/ENV/THREAD\` URLs; subagents need a real child thread. Keep canonical IDs/percent escapes intact. Omit unknown links. Agent-authored snapshot; details are collapsed Markdown. No footer/fake controls or duplicate prose.

To collect several inputs, emit JSON inside literal Markdown triple-backtick \`form\` fences, closed as below, never <form>/XML/JSX wrappers:
\`\`\`form
{"title":"Run setup","fields":[{"name":"target","label":"Target","type":"text","required":true},{"name":"scope","label":"Scope","type":"select","required":true,"options":["Web","Desktop"]}]}
\`\`\`
Only text/select fields exist; names must be unique. Set required:true on every user-required field, including selects. Optional submitLabel. Submitted answers arrive as a user message; wait for it.

For explicitly requested inline HTML, use a closed \`html render\` fence with self-contained HTML. Prefer existing components. Raw HTML outside it is not an embed. Existing html_preview/html_render rules apply to other visuals.`;
