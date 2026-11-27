/* oxlint-disable shadcn/no-unknown-classes -- Feature-local styles are imported from MarkdownResourcesBlock.css. */
import { T, useGT, useMessages, Var } from "gt-react";
import { BotIcon, InfoIcon, MessageSquareIcon, TriangleAlertIcon } from "lucide-react";
import { Fragment } from "react";

import {
  PullRequestReviewDecisionGlyph,
  pullRequestChecksStatePresentation,
} from "~/components/pullRequest/pullRequestPresentation";
import { Badge } from "~/components/ui/badge";
import { SharedTooltipTrigger } from "~/components/ui/shared-tooltip";
import { inlineMarkdown, type RenderBlockMarkdown } from "./markdownInline";
import type { MarkdownResourcesDefinition } from "./markdownResources";
import "./MarkdownCard.css";
import "./MarkdownDisclosure.css";
import "./MarkdownResourcesBlock.css";

type Item = MarkdownResourcesDefinition["items"][number];

const escapeLabel = (label: string) => label.replace(/\s+/g, " ").replace(/[\\[\]`*_<>&]/g, "\\$&");

export function MarkdownResourcesBlock({
  resources,
  renderMarkdown,
}: {
  resources: MarkdownResourcesDefinition;
  renderMarkdown: RenderBlockMarkdown;
}) {
  const gt = useGT();
  const md = (text: string) => inlineMarkdown(text, renderMarkdown);
  const resolve = useMessages();
  const flat = resources.items.filter((i) => i.group === undefined);
  const groups = (resources.groups ?? [])
    .map((group) => ({ ...group, items: resources.items.filter((i) => i.group === group.id) }))
    .filter((group) => group.items.length > 0);
  const coverage = {
    all: gt("All"),
    subset: gt("Subset"),
    unknown: gt("Coverage unknown"),
  }[resources.coverage];
  const showBar = resources.coverage === "all" && groups.length >= 2;

  const diff = (value: NonNullable<Item["diff"]>) => {
    const parts = [
      value.additions === undefined
        ? null
        : {
            text: `+${value.additions}`,
            name: gt("{n} additions", { n: value.additions }),
            className: "markdown-resources-add",
          },
      value.deletions === undefined
        ? null
        : {
            text: `−${value.deletions}`,
            name: gt("{n} deletions", { n: value.deletions }),
            className: "markdown-resources-del",
          },
    ].filter((part) => part !== null);
    const files =
      value.files === undefined
        ? null
        : gt("{n, plural, one {{n} file} other {{n} files}}", { n: value.files });
    return (
      <span
        className="markdown-resources-muted"
        aria-label={[...parts.map((part) => part.name), files].filter(Boolean).join(", ")}
      >
        <span aria-hidden="true" className="tabular-nums">
          {parts.map((part, index) => (
            <span key={part.text}>
              {index > 0 ? " / " : null}
              <span className={part.className}>{part.text}</span>
            </span>
          ))}
          {parts.length > 0 && files ? " · " : null}
          {files}
        </span>
      </span>
    );
  };

  // Quiet by default; color only for failing checks and a review verdict (the glyph owns those).
  const signals = (item: Item) => {
    const checks = item.checks ? pullRequestChecksStatePresentation(item.checks, resolve) : null;
    const comments = [
      {
        kind: "human",
        Icon: MessageSquareIcon,
        count: item.comments?.human ?? 0,
        label: gt("{count, plural, one {{count} human comment} other {{count} human comments}}", {
          count: item.comments?.human ?? 0,
        }),
      },
      {
        kind: "agent",
        Icon: BotIcon,
        count: item.comments?.agent ?? 0,
        label: gt("{count, plural, one {{count} agent comment} other {{count} agent comments}}", {
          count: item.comments?.agent ?? 0,
        }),
      },
    ].filter((comment) => comment.count > 0);
    if (!checks && !item.review && comments.length === 0) return null;
    return (
      <span className="markdown-resources-signals">
        {checks ? (
          <SharedTooltipTrigger
            render={<span data-tone={item.checks === "failing" ? "danger" : undefined} />}
            label={checks.label}
          >
            <checks.Icon role="img" aria-label={checks.label} />
          </SharedTooltipTrigger>
        ) : null}
        {item.review ? <PullRequestReviewDecisionGlyph decision={item.review} /> : null}
        {comments.map((comment) => (
          <SharedTooltipTrigger
            key={comment.kind}
            render={<span role="img" aria-label={comment.label} />}
            label={comment.label}
          >
            <comment.Icon aria-hidden="true" />
            <span aria-hidden="true">{comment.count}</span>
          </SharedTooltipTrigger>
        ))}
      </span>
    );
  };

  const row = (item: Item, index: number, groupLabel: string) => {
    const title = item.url
      ? renderMarkdown(
          `[${escapeLabel(item.title)}](${(item.url.startsWith("/") ? item.url : new URL(item.url).href).replace(/\(/g, "%28").replace(/\)/g, "%29")})`,
          false,
          false,
        )
      : item.title;
    const sameAsGroup = item.state?.trim().toLowerCase() === groupLabel.trim().toLowerCase();
    const stateLabel = sameAsGroup ? undefined : item.state;
    const details = (item.meta ?? []).map((meta) => md(`${meta.label}: ${meta.value}`));
    return (
      <div className="markdown-resources-row" data-stale={item.stale || undefined} key={index}>
        <span className="markdown-resources-id">{item.id}</span>
        <div className="markdown-resources-main">
          {title}
          {item.stale ? <span className="markdown-resources-muted">{gt("Last known")}</span> : null}
          {stateLabel ? (
            <Badge size="sm" variant="outline">
              {stateLabel}
            </Badge>
          ) : null}
          {signals(item)}
        </div>
        {details.length > 0 || item.diff ? (
          <div className="markdown-resources-muted">
            {details.map((detail, index) => (
              // oxlint-disable-next-line react/no-array-index-key -- Immutable list, labels can repeat.
              <Fragment key={index}>
                {index > 0 ? " · " : null}
                {detail}
              </Fragment>
            ))}
            {details.length > 0 && item.diff ? " · " : null}
            {item.diff ? diff(item.diff) : null}
          </div>
        ) : null}
        {item.summary ? (
          <div className="markdown-resources-muted">
            {renderMarkdown(item.summary, false, false)}
          </div>
        ) : null}
        {item.next ? (
          <div>
            <T>
              Next: <Var>{md(item.next)}</Var>
            </T>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="markdown-card markdown-resources">
      <div className="markdown-resources-header">
        <div className="markdown-card-title">
          {md(resources.title)}{" "}
          <span className="markdown-resources-muted">{md(resources.scope)}</span>
        </div>
        <div className="markdown-resources-muted">
          {coverage}
          {resources.asOf ? ` · ${gt("Snapshot: {date}", { date: resources.asOf })}` : null}
        </div>
      </div>
      {showBar ? (
        <div className="markdown-resources-bar" aria-hidden="true">
          {groups.map((group) => (
            <i key={group.id} style={{ flexGrow: group.items.length }} />
          ))}
        </div>
      ) : null}
      {resources.correction ? (
        <div className="markdown-resources-note">
          <TriangleAlertIcon aria-hidden="true" />
          <T>
            Corrected: <Var>{md(resources.correction)}</Var>
          </T>
        </div>
      ) : null}
      {flat.map((item, index) => row(item, index, ""))}
      {groups.map((group) => {
        const heading = (
          <>
            {md(group.label)}{" "}
            <span className="markdown-resources-count">({group.items.length})</span>
          </>
        );
        const rows = group.items.map((item, index) => row(item, index, group.label));
        return group.collapsed ? (
          <details className="markdown-resources-group" key={group.id}>
            <summary>{heading}</summary>
            {rows}
          </details>
        ) : (
          <section className="markdown-resources-group" key={group.id}>
            <div className="markdown-resources-heading">{heading}</div>
            {rows}
          </section>
        );
      })}
      {resources.caveat ? (
        <div className="markdown-card-footnote">
          <InfoIcon aria-hidden="true" />
          {md(resources.caveat)}
        </div>
      ) : null}
    </div>
  );
}
