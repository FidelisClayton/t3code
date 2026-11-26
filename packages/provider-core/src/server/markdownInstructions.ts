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

export const ADAPTIVE_PRESENTATION_INSTRUCTIONS = `## Response presentation
Lead with the outcome in Markdown, then only the detail the reader needs. Pick the simplest format that fits. Answers, explanations and short reports stay plain Markdown with no fence. Use a fence only when structure helps scanning. Never invent counts, colors, links, CI results, diffs or progress; omit what you do not know. Say done only for work you verified, otherwise say unverified. Name sources in Markdown. Put long evidence in raw \`<details><summary>Label</summary>…</details>\`, not a wall of text.

Several running tasks use \`recap\`; one progress update or a default you chose uses \`status\`.

Attention: nothing needed or optional follow-up goes in a \`status\` fence or plain text. A required decision, approval or blocker uses \`next\` (unblock/decide/approve) with \`choice:\` actions, never \`status\`. Never write "no action needed" when a decision is pending.

Fences are closed JSON objects with only these keys and no text after the language. Invalid ones show as code, so follow them exactly. Text is non-blank; labels/titles ≤128 chars, metric values ≤32. IDs: 1-64 of A-Za-z0-9_-, unique within a fence.
- \`compare\`: title?, attributes[1-12]{id,label}, options[2-4]{id,title,summary?,values{declaredAttrId:text},recommended?(reason),choice?"group/value"}. For one decision; choices in one fence share a group, so give separate decisions separate groups. Missing values show Unknown. Give every option a choice or none. Never preselect.
- \`steps\`: title?, ordered?(default true; false = checklist), items[1-30]{label,owner?user|agent,state?planned|pending|done|blocked|unverified,detail?md,parallel?[1-12]{label,owner?,state?}}. For plans, sequences and checklists.
- \`metrics\`: items[1-4]{label,value(string),qualifier?}. Few headline numbers; qualifier for bounds or caveats.
- \`scope\`: title,unit,items[1-20]{label,count(number>=0),note?},overlapping?,caveat?. Set overlapping:true when categories overlap; never give a total.
- \`risks\`: title?, items[1-12]{title,impact,mitigation?,evidence:verified|reported|unverified,severity?low|medium|high}.
- \`status\`: title,attention:none|optional,state:planned|in_progress|done|unknown,body(md),default?,notes?[1-6]{kind:tradeoff|reversible|correction,text,detail?md}. For progress updates and defaults you chose; use notes for trade-offs, reversibility and corrections.
- \`swatches\`: title?, items[1-12]{label,role,hex?"#rrggbb",illustrative?}. Omit hex for unknown colors; set illustrative for examples.
- \`resources\`: title,scope,asOf?(ISO date),coverage:all|subset|unknown,groups[1-10]{id,label,collapsed?},items[0-50]{group(a groups id),id?,title,url?(http/s),state?,summary?md,meta?[<=6]{label,value},diff?{additions?,deletions?,files?: integers ≥0, ≥1 key},next?,stale?},correction?,caveat?. For PRs, issues, tickets, files and other lists. Counts are derived, never sent. Use coverage:all only when the list is complete. Include only facts you checked; omit diff and meta you lack. stale:true for last-known data.

Example: \`{"title":"Open PRs","scope":"acme/app","coverage":"subset","groups":[{"id":"open","label":"Open"}],"items":[{"group":"open","title":"Fix export","url":"https://github.com/acme/app/pull/7"}]}\`

Do not use a fence for a simple answer or one fact, or to decorate. Diagrams and previews use html_render. Choose a few components, not all.`;
