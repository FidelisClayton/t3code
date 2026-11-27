/* oxlint-disable shadcn/no-unknown-classes -- Feature-local styles are imported from MarkdownStatusBlock.css. */
/* oxlint-disable react/no-array-index-key -- Each immutable status remounts when its source changes. */
import { useAtomValue } from "@effect/atom-react";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { derivePendingThreadRequests } from "@t3tools/client-runtime/state/thread-requests";
import { T, useGT, Var } from "gt-react";
import { InfoIcon, TriangleAlertIcon, Undo2Icon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { useQuietThreadProjection } from "~/state/entities";
import { childThreadApprovalsAtom } from "~/state/threads";
import { inlineMarkdown, type RenderBlockMarkdown } from "./markdownInline";
import type { MarkdownStatusDefinition } from "./markdownStatus";
import "./MarkdownCard.css";
import "./MarkdownDisclosure.css";
import "./MarkdownStatusBlock.css";

/** True only when the thread's projection is loaded and neither it nor its child threads await an approval or answer. */
function useThreadHasNoPendingRequests(threadRef: ScopedThreadRef | undefined) {
  const projection = useQuietThreadProjection(threadRef ?? null)?.projection;
  const childApprovals = useAtomValue(childThreadApprovalsAtom(threadRef ?? null));
  if (!projection || childApprovals.length > 0) return false;
  const pending = derivePendingThreadRequests(projection);
  return pending.approvals.length === 0 && pending.userInputs.length === 0;
}

export function MarkdownStatusBlock({
  status,
  threadRef,
  renderMarkdown,
}: {
  status: MarkdownStatusDefinition;
  threadRef?: ScopedThreadRef | undefined;
  renderMarkdown: RenderBlockMarkdown;
}) {
  const gt = useGT();
  const md = (text: string) => inlineMarkdown(text, renderMarkdown);
  const verifiedQuiet = useThreadHasNoPendingRequests(threadRef);
  const attention =
    status.attention === "optional"
      ? gt("Optional")
      : verifiedQuiet
        ? gt("No action needed")
        : null;
  const kindIcons = { tradeoff: TriangleAlertIcon, reversible: Undo2Icon, correction: InfoIcon };
  const kinds = {
    tradeoff: gt("Trade-off"),
    reversible: gt("Reversible"),
    correction: gt("Corrected"),
  };
  return (
    <div className="markdown-card markdown-status">
      <div className="markdown-status-head">
        <div className="markdown-card-title markdown-status-title">
          <i className="markdown-status-dot" data-state={status.state} aria-hidden="true" />
          {md(status.title)}
        </div>
        {attention ? (
          <Badge variant={status.attention === "optional" ? "info" : "success"}>{attention}</Badge>
        ) : null}
      </div>
      <div className="markdown-status-body">
        {renderMarkdown(status.body)}
        {status.default ? (
          <div className="markdown-status-default">
            <T>
              Default: <Var>{md(status.default)}</Var>
            </T>
          </div>
        ) : null}
      </div>
      {status.notes ? (
        <div className="markdown-status-notes">
          {status.notes.map((note, index) => {
            const Icon = kindIcons[note.kind];
            const heading = (
              <>
                <span className="markdown-status-kind">{kinds[note.kind]}</span>
                <span>{md(note.text)}</span>
              </>
            );
            return (
              <div className="markdown-status-note" data-kind={note.kind} key={index}>
                <Icon aria-hidden="true" />
                {note.detail === undefined ? (
                  <span>{heading}</span>
                ) : (
                  <details>
                    <summary>{heading}</summary>
                    <div className="markdown-status-detail">{renderMarkdown(note.detail)}</div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
