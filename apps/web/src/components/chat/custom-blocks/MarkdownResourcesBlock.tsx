/* oxlint-disable shadcn/no-unknown-classes -- Feature-local styles are imported from MarkdownResourcesBlock.css. */
import { useGT } from "gt-react";
import { InfoIcon, TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "~/components/ui/badge";
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
  renderMarkdown: (body: string, namedReferences?: boolean, sourceChoices?: boolean) => ReactNode;
}) {
  const gt = useGT();
  const groups = resources.groups
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

  const row = (item: Item, index: number, groupLabel: string) => {
    const title = item.url
      ? renderMarkdown(
          `[${escapeLabel(item.title)}](${new URL(item.url).href.replace(/\(/g, "%28").replace(/\)/g, "%29")})`,
          false,
          false,
        )
      : item.title;
    const sameAsGroup = item.state?.trim().toLowerCase() === groupLabel.trim().toLowerCase();
    const stateLabel = sameAsGroup ? undefined : item.state;
    const details = (item.meta ?? []).map((meta) => `${meta.label}: ${meta.value}`);
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
        </div>
        {details.length > 0 || item.diff ? (
          <div className="markdown-resources-muted">
            {details.join(" · ")}
            {details.length > 0 && item.diff ? " · " : null}
            {item.diff ? diff(item.diff) : null}
          </div>
        ) : null}
        {item.summary ? (
          <div className="markdown-resources-muted">
            {renderMarkdown(item.summary, false, false)}
          </div>
        ) : null}
        {item.next ? <div>{gt("Next: {next}", { next: item.next })}</div> : null}
      </div>
    );
  };

  return (
    <div className="markdown-card markdown-resources">
      <div className="markdown-resources-header">
        <p className="markdown-card-title">{resources.title}</p>
        <div className="markdown-resources-muted">
          {resources.scope} · {coverage}
          {resources.asOf ? ` · ${gt("Snapshot: {date}", { date: resources.asOf })}` : null}
        </div>
        <div className="markdown-resources-muted">
          {groups.map((group) => `${group.label} (${group.items.length})`).join(" · ")}
        </div>
        {showBar ? (
          <div className="markdown-resources-bar" aria-hidden="true">
            {groups.map((group) => (
              <i key={group.id} style={{ flexGrow: group.items.length }} />
            ))}
          </div>
        ) : null}
      </div>
      {resources.correction ? (
        <div className="markdown-resources-note">
          <TriangleAlertIcon aria-hidden="true" />
          {gt("Corrected: {text}", { text: resources.correction })}
        </div>
      ) : null}
      {groups.map((group) => {
        const heading = (
          <>
            {group.label} <span className="markdown-resources-count">({group.items.length})</span>
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
        <p className="markdown-card-footnote">
          <InfoIcon aria-hidden="true" />
          {resources.caveat}
        </p>
      ) : null}
    </div>
  );
}
