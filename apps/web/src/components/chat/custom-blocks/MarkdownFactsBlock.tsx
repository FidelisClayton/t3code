/* oxlint-disable shadcn/no-unknown-classes -- Feature-local styles are imported from MarkdownFactsBlock.css. */
/* oxlint-disable react/no-array-index-key -- Each immutable block remounts when its source changes; titles can repeat. */
import { useGT } from "gt-react";
import {
  BugIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleXIcon,
  ClockIcon,
  DatabaseIcon,
  FileCode2Icon,
  FilesIcon,
  GaugeIcon,
  GitBranchIcon,
  InfoIcon,
  KeyRoundIcon,
  LinkIcon,
  PackageIcon,
  ServerIcon,
  ShieldIcon,
  TerminalIcon,
  TriangleAlertIcon,
  UsersIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";

import { PullRequestGlyph } from "~/components/pullRequest/pullRequestIcons";
import { Badge } from "~/components/ui/badge";
import {
  factToneCounts,
  type FactIcon,
  type FactTone,
  type MarkdownFactsDefinition,
} from "./markdownFacts";
import { inlineMarkdown, type RenderBlockMarkdown } from "./markdownInline";
import "./MarkdownCard.css";
import "./MarkdownFactsBlock.css";

const icons = {
  "circle-x": CircleXIcon,
  "triangle-alert": TriangleAlertIcon,
  info: InfoIcon,
  "circle-check": CircleCheckIcon,
  "git-pull-request": PullRequestGlyph.pullRequest,
  "git-branch": GitBranchIcon,
  package: PackageIcon,
  "key-round": KeyRoundIcon,
  files: FilesIcon,
  "file-code": FileCode2Icon,
  wrench: WrenchIcon,
  database: DatabaseIcon,
  server: ServerIcon,
  shield: ShieldIcon,
  clock: ClockIcon,
  bug: BugIcon,
  gauge: GaugeIcon,
  terminal: TerminalIcon,
  link: LinkIcon,
  users: UsersIcon,
} satisfies Record<FactIcon, LucideIcon>;

const badgeVariant = {
  problem: "error",
  warn: "warning",
  info: "info",
  ok: "success",
} as const;

export function MarkdownFactsBlock({
  facts,
  renderMarkdown,
}: {
  facts: MarkdownFactsDefinition;
  renderMarkdown: RenderBlockMarkdown;
}) {
  const gt = useGT();
  const md = (text: string) => inlineMarkdown(text, renderMarkdown);
  const toneLabel: Record<FactTone, string> = {
    problem: gt("Problem", { $context: "tone of a fact in a list" }),
    warn: gt("Warning", { $context: "tone of a fact in a list" }),
    info: gt("Info", { $context: "tone of a fact in a list" }),
    ok: gt("OK", { $context: "tone of a fact in a list" }),
  };
  const countLabel = (tone: FactTone, count: number) => {
    switch (tone) {
      case "problem":
        return gt("{count, plural, one {{count} problem} other {{count} problems}}", { count });
      case "warn":
        return gt("{count, plural, one {{count} warning} other {{count} warnings}}", { count });
      case "info":
        return gt("{count} info", { count, $context: "count of informational facts" });
      case "ok":
        return gt("{count} ok", { count, $context: "count of facts that are fine" });
    }
  };
  const counts = factToneCounts(facts.items);
  return (
    <div className="markdown-card markdown-facts">
      {facts.title || counts.length > 0 ? (
        <div className="markdown-facts-head">
          {facts.title ? <div className="markdown-card-title">{md(facts.title)}</div> : null}
          {counts.length > 0 ? (
            <span className="markdown-facts-counts">
              {counts.map(({ tone, count }) => (
                <Badge key={tone} variant={badgeVariant[tone]}>
                  {countLabel(tone, count)}
                </Badge>
              ))}
            </span>
          ) : null}
        </div>
      ) : null}
      <ul className="markdown-card-list">
        {facts.items.map((item, index) => {
          const Icon = item.icon ? icons[item.icon] : null;
          const row = (
            <>
              <span
                className="markdown-facts-icon"
                {...(item.tone
                  ? { role: "img", "aria-label": toneLabel[item.tone] }
                  : { "aria-hidden": true })}
              >
                {Icon ? <Icon aria-hidden="true" /> : <i className="markdown-facts-dot" />}
              </span>
              <span className="markdown-facts-text">
                <span className="markdown-facts-title">{md(item.title)}</span>
                <span className="markdown-facts-brief">{md(item.brief)}</span>
              </span>
            </>
          );
          return (
            <li className="markdown-facts-item" data-tone={item.tone} key={index}>
              {item.details === undefined ? (
                <div className="markdown-facts-row">{row}</div>
              ) : (
                // The first item starts open so one fact leads; the rest stay one row each.
                <details open={index === 0}>
                  <summary className="markdown-facts-row">
                    {row}
                    <ChevronRightIcon aria-hidden="true" className="markdown-facts-chevron" />
                  </summary>
                  <div className="markdown-facts-details">{renderMarkdown(item.details)}</div>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
