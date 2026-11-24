/* oxlint-disable shadcn/no-unknown-classes -- Feature-local styles are imported from MarkdownRecapBlock.css. */
/* oxlint-disable react/no-array-index-key -- Each immutable recap remounts when its source changes. */
import type { ScopedThreadRef } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { ArrowUpRightIcon, GitBranchIcon } from "lucide-react";
import { T, useGT } from "gt-react";
import type { ReactNode } from "react";
import { buildThreadRouteParams } from "../../../threadRoutes";
import { MarkdownReferenceLink } from "./MarkdownReferenceLink";
import type { MarkdownRecapDefinition } from "./markdownRecap";
import "./MarkdownRecapBlock.css";

export function MarkdownRecapBlock({
  recap,
  threadRef,
  namedReferences,
  renderMarkdown,
}: {
  recap: MarkdownRecapDefinition;
  threadRef: ScopedThreadRef | undefined;
  namedReferences: boolean;
  renderMarkdown: (body: string, namedReferences?: boolean, sourceChoices?: boolean) => ReactNode;
}) {
  const gt = useGT();
  const label = (entry: { label: string; reference?: string }) =>
    entry.reference && namedReferences ? (
      <MarkdownReferenceLink
        id={entry.reference}
        threadRef={threadRef}
        copyMarkdown={`[${entry.label}](ref:${entry.reference})`}
        renderBody={(body) => renderMarkdown(body, false, false)}
      >
        {entry.label}
      </MarkdownReferenceLink>
    ) : (
      entry.label
    );
  return (
    <div className="markdown-recap">
      <p className="markdown-recap-lead">{recap.lead}</p>
      <div className="markdown-recap-rows">
        {recap.items.map((item, index) => (
          <div className="markdown-recap-row" key={index}>
            <span className="markdown-recap-label">{label(item)}</span>
            {item.details === undefined ? (
              <span
                aria-label={`${item.status === "running" ? "Running" : "Building"}: ${item.summary}`}
              >
                <i className={`markdown-recap-marker ${item.status}`} aria-hidden="true" />
                {item.summary}
              </span>
            ) : (
              <details>
                <summary
                  aria-label={`${item.status === "running" ? "Running" : "Building"}: ${item.summary}`}
                >
                  <i className={`markdown-recap-marker ${item.status}`} aria-hidden="true" />
                  {item.summary}
                </summary>
                <div className="markdown-recap-details">{renderMarkdown(item.details)}</div>
              </details>
            )}
            {item.work ? (
              <Link
                className="markdown-recap-work"
                to="/$environmentId/$threadId"
                params={buildThreadRouteParams(item.work.ref)}
                aria-label={gt("Open {label} {kind}", { label: item.label, kind: item.work.kind })}
              >
                {item.work.kind === "thread" ? (
                  <ArrowUpRightIcon aria-hidden="true" />
                ) : (
                  <GitBranchIcon aria-hidden="true" />
                )}
                {item.work.kind === "thread" ? gt("Thread") : gt("Subagent")}
              </Link>
            ) : null}
          </div>
        ))}
        {recap.next ? (
          <div className="markdown-recap-row">
            <span className="markdown-recap-next">
              <T>Next</T>
            </span>
            <p className="markdown-recap-sequence">
              <i className="markdown-recap-marker next" aria-hidden="true" />
              <T>One at a time:</T>{" "}
              {recap.next.map((entry, index) => (
                <span key={index}>
                  {index > 0 ? gt(", then ") : ""}
                  {label(entry)}
                </span>
              ))}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
