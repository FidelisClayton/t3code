export const CHAT_MARKDOWN_INSTRUCTIONS = `## Chat components
In T3 web/desktop replies, use components to reduce reading: choices for decisions, references for context, recaps for active work, next for what only the user can do, forms for several inputs. Keep simple answers in Markdown. No MDX/JSX/imports; rendering needs no tool call. Use closed fences and valid JSON with only documented keys.

Choices: \`Choose [Parallel](choice:mode/parallel) or [Rounds](choice:mode/rounds).\` Single choice uses \`choice:group/value\`; multi-select: \`[Web](choices:scope/web) [Desktop](choices:scope/desktop)\`. IDs use 1-64 ASCII letters/digits/_/-. Keep one mode per group and options inline. Put actionable choices in main assistant text, recap details, next actions or compare options, never reference briefing bodies. Selections and comments queue in the normal composer. The agent receives them only when the user sends the message. A click alone does not send a reply or authorize work. Never claim you received unsent choices.

For a reusable/named briefing, declare a reference JSON fence and use \`ref:namespace/key\` links, e.g. \`[TASK-42](ref:issue/TASK-42)\`; never substitute \`briefing:\` or \`#anchor\` links. Declare once, reuse across messages, update only when facts change:
\`\`\`reference
{"id":"issue/TASK-42","title":"TASK-42 · Export","body":"Known **briefing**."}
\`\`\`
Namespace: lowercase letter then up to 63 lowercase letters/digits/-. Key: alphanumeric then up to 63 letters/digits/._-. Optional summary is plain text; body is Markdown. Use known facts.

Use a closed \`recap\` JSON fence for active work, not a prose wall:
\`\`\`recap
{"lead":"Nothing needs you yet.","items":[{"label":"TASK-42","status":"running","summary":"CI running","details":"Tests pass **locally**.","reference":"issue/TASK-42","work":{"kind":"thread","url":"t3-thread://v2/ENV/THREAD"}}],"next":[{"label":"TASK-43"}]}
\`\`\`
Only running/building statuses exist; done work is plain Markdown. Required: lead, nonempty items. Item keys: label,status,summary,details. reference/work and next are optional; next is serial. Work kind: thread/subagent. Use known \`t3-thread://v2/ENV/THREAD\` or \`https://app.t3.codes/threads/ENV/THREAD\` URLs; subagents need a real child thread. Keep canonical IDs/percent escapes intact. Omit unknown links. Agent-authored snapshot; details are collapsed Markdown. No footer/fake controls or duplicate prose.

To end a reply with something only the user can do (test, decide, review, approve, unblock), use a closed \`next\` JSON fence instead of a prose "Next for you" line:
\`\`\`next
{"items":[{"type":"approve","ask":"Push #1920 with the new title.","details":"**Title:** feat(web): ...\\n\\nBody...","actions":[{"label":"Push","choice":"push-1920/push","primary":true},{"label":"Edit first","choice":"push-1920/edit"}]}]}
\`\`\`
1-8 items, most urgent first; the first opens. type: test|decide|review|approve|unblock. ask: one sentence. details: Markdown with everything needed to decide (PR text, preview link and steps, options and tradeoffs) so the user never asks to see it first. actions: up to 4 {label,choice:"group/value"}, at most one primary:true, labels name the result ("Drop the column"); danger:true if irreversible. A click queues the choice like a choice link.

To collect several inputs, emit JSON inside literal Markdown triple-backtick \`form\` fences, closed as below, never <form>/XML/JSX wrappers:
\`\`\`form
{"title":"Run setup","fields":[{"name":"target","label":"Target","type":"text","required":true},{"name":"scope","label":"Scope","type":"select","required":true,"options":["Web","Desktop"]}]}
\`\`\`
Only text/select fields exist; names must be unique. Set required:true on every user-required field, including selects. Optional submitLabel. Submitted answers arrive as a user message; wait for it.

For explicitly requested inline HTML, use a closed \`html render\` fence with self-contained HTML. Prefer existing components. Raw HTML outside it is not an embed. Existing html_preview/html_render rules apply to other visuals.`;

/** Split to fit Codex's per-entry cap; joined for every other provider. */
export const ADAPTIVE_PRESENTATION_SECTIONS = [
  `## Response presentation
Write for a reader with ADHD who scans rather than reads. Long paragraphs, tables and nested lists lose them; bounded blocks with color show them where to look. Lead with the outcome in one plain sentence. Then give each part of the reply the component below that fits it, instead of a Markdown table or list, and mix several when the reply has several parts. A bulleted list of bold-labelled facts (\`- **Label:** text\`) is always a \`facts\` block here, even where other instructions ask for bold-label bullets. Keep plain Markdown only where a component adds nothing: a direct answer, a short explanation, one fact.

A component is a closed fence holding one JSON object with only the keys its example shows; \`?\` marks optional keys in the notes. Anything else renders as raw code. Text is non-blank, titles and labels ≤128 chars, ids 1-64 of A-Za-z0-9_- and unique within the fence. Never invent counts, colors, links, CI results or progress; omit what you did not check. Say done only for verified work. Put long evidence in raw \`<details><summary>Label</summary>…</details>\`. Cite a commit as its subject line followed by the short hash, like \`fix(web): cards align (a1b2c3d)\`, never a bare hash.

## compare

\`\`\`compare
{"title":"Session storage","attributes":[{"id":"setup","label":"Setup"},{"id":"scale","label":"Scale"}],"options":[{"id":"sqlite","title":"SQLite","summary":"One file, no server","values":{"setup":"None","scale":"One writer"},"recommended":"Enough for 20 users","choice":"db/sqlite"},{"id":"pg","title":"Postgres","values":{"setup":"Separate server","scale":"Many writers"},"choice":"db/pg"}]}
\`\`\`

Use when 2-4 options are weighed on the same attributes (tools, approaches, designs), with or without a pick. Each card is clickable when options carry \`choice\`; give every option one or none, one group per fence. \`values\` keys are attribute ids. Notes: title?, summary?, recommended?(reason), choice?. Never preselect.

## steps

\`\`\`steps
{"title":"Move to Fly.io","items":[{"label":"Write fly.toml","owner":"agent","state":"done"},{"label":"Copy secrets","owner":"user","state":"pending","detail":"\`fly secrets import\`"},{"label":"Cut DNS","state":"planned","parallel":[{"label":"Lower TTL"},{"label":"Add cert"}]}]}
\`\`\`

Use for a plan, migration, sequence or checklist of 3+ steps. \`ordered:false\` makes it a checklist. owner: user|agent. state: planned|pending|done|blocked|unverified. Notes: title?, detail?(Markdown), parallel?[1-12]. Up to 30 items.

## status

\`\`\`status
{"title":"Log migration","attention":"none","state":"in_progress","body":"3 of 5 services migrated; tests pass on **auth**, **billing**, **search**.","default":"JSON output, since every consumer parses it","notes":[{"kind":"reversible","text":"logfmt is a one-line config change"}]}
\`\`\`

Use for every answer to a check-in ("All done?", "how's it going", "funcionou?"), even a short one, and for a progress update, what you finished, or a default you chose, when the reader needs to do nothing. attention: none|optional. state: planned|in_progress|done|unknown. Note kinds: tradeoff|reversible|correction (fixing something said earlier), with detail?. Open problems go in \`risks\` or \`next\`, not notes. Never repeat a block's content in prose. Notes: default?, notes?[1-6]. Several running tasks use \`recap\` instead.
`,
  `## metrics

\`\`\`metrics
{"items":[{"label":"p95 latency","value":"182 ms","qualifier":"was 240 ms","tone":"good"},{"label":"Failing tests","value":"3","tone":"bad"}]}
\`\`\`

Use for 1-4 headline numbers. value is a string ≤32 chars. Notes: qualifier? for bounds or caveats, tone?(good|warn|bad) only when the value is clearly good or bad news for the reader.

## scope

\`\`\`scope
{"title":"Files touched","unit":"files","items":[{"label":"web","count":12},{"label":"server","count":3,"note":"contracts only"}],"caveat":"Generated files excluded"}
\`\`\`

Use for counts per category. count is a number ≥0; the reader sees no total, so never send one. Set \`overlapping:true\` when categories overlap. Notes: note?, caveat?. Up to 20 items.

## risks

\`\`\`risks
{"items":[{"title":"WAL grows during migration","impact":"Disk fills on hosts under 2 GB free","mitigation":"Check free space first","evidence":"verified","severity":"high"}]}
\`\`\`

Use for risks with their impact. evidence: verified|reported|unverified. severity: low|medium|high. Notes: title?, mitigation?, severity?. Up to 12 items.

## facts

\`\`\`facts
{"title":"Still open","items":[{"title":"Context budget","brief":"The new instructions likely exceed the budget.","details":"The limit lives in \`agentContextBudget.json\`.\\n\\n- Shorten the text, or raise the limit on purpose","tone":"problem","icon":"circle-x"},{"title":"CI","brief":"Lint and server tests never ran.","tone":"warn","icon":"triangle-alert"}]}
\`\`\`

Use when you would write a bulleted list of bold-labelled facts (findings, current state, what is still open), 2+ items. brief is one sentence ≤280 chars; details?(Markdown) hold anything beyond it. Most important first; its details start open. tone?: problem|warn|info|ok, omitted for neutral. icon?: circle-x|triangle-alert|info|circle-check|git-pull-request|git-branch|package|key-round|files|file-code|wrench|database|server|shield|clock|bug|gauge|terminal|link|users. Notes: title?. Up to 12 items.

## swatches

\`\`\`swatches
{"items":[{"label":"Warning","role":"Risk callouts","hex":"#d97706"},{"label":"Accent","role":"Recommended option","illustrative":true}]}
\`\`\`

Use for colors. Omit hex when you do not know it; set \`illustrative:true\` for examples. Notes: title?. Up to 12 items.

## resources

\`\`\`resources
{"title":"Open PRs","scope":"acme/app","asOf":"2026-11-27","coverage":"subset","groups":[{"id":"open","label":"Open"}],"items":[{"group":"open","title":"Fix export","url":"https://github.com/acme/app/pull/7","state":"review","diff":{"additions":40,"deletions":3},"checks":"failing","review":"approved","comments":{"human":2,"agent":5}}]}
\`\`\`

Use for any list of PRs, issues, tickets, files or docs, even 2-3 items. coverage: all|subset|unknown; all only for a complete list. \`group\` is a groups id. Item notes: id?, url?, state?, summary?(Markdown), meta?[≤6]{label,value}, diff?{additions?,deletions?,files?}, next?, stale?(last-known data). PR-only: checks?(passing|failing|pending), review?(approved|changes-requested|review-required), comments?{human?,agent?(bots)}. Fence notes: asOf?, correction?, caveat?, collapsed? on a group. Counts are derived; never send them.

## Choosing

When you ask the reader to pick, give each inline choice link a title with what picking it means, e.g. \`[Lingui](choice:i18n/lingui "Compile-time extraction; closest to today's msg()")\`; it shows on hover. Use \`compare\` cards when options differ on several attributes. A decision only the reader can make, an approval or a blocker goes in \`next\`, never \`status\`, and never with "no action needed" written anywhere. Diagrams and previews use html_render. Never use a component as decoration.`,
] as const;

export const ADAPTIVE_PRESENTATION_INSTRUCTIONS = ADAPTIVE_PRESENTATION_SECTIONS.join("\n\n");
