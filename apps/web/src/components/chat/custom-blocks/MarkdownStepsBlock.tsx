/* oxlint-disable shadcn/no-unknown-classes -- Feature-local styles are imported from MarkdownStepsBlock.css. */
/* oxlint-disable react/no-array-index-key -- Each immutable steps list remounts when its source changes. */
import { useGT } from "gt-react";
import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleHelpIcon,
  CircleXIcon,
  ClockIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { MarkdownStepsDefinition } from "./markdownSteps";
import "./MarkdownDisclosure.css";
import "./MarkdownCard.css";
import "./MarkdownStepsBlock.css";

type Meta = { owner?: "user" | "agent"; state?: MarkdownStepsDefinition["items"][number]["state"] };

const stateIcons = {
  planned: CircleDashedIcon,
  pending: ClockIcon,
  done: CircleCheckIcon,
  blocked: CircleXIcon,
  unverified: CircleHelpIcon,
};

export function MarkdownStepsBlock({
  steps,
  renderMarkdown,
}: {
  steps: MarkdownStepsDefinition;
  renderMarkdown: (body: string, namedReferences?: boolean, sourceChoices?: boolean) => ReactNode;
}) {
  const gt = useGT();
  const owners = { user: gt("You"), agent: gt("Agent") };
  const states = {
    planned: gt("Planned"),
    pending: gt("Pending"),
    done: gt("Done"),
    blocked: gt("Blocked"),
    unverified: gt("Unverified"),
  };
  const meta = ({ owner, state }: Meta) => {
    if (!owner && !state) return null;
    const Icon = state ? stateIcons[state] : null;
    return (
      <span className="markdown-steps-meta">
        {owner ? (
          <span className="markdown-steps-owner" data-owner={owner}>
            {owners[owner]}
          </span>
        ) : null}
        {state && Icon ? (
          <span className="markdown-steps-state" data-state={state}>
            <Icon aria-hidden="true" />
            {states[state]}
          </span>
        ) : null}
      </span>
    );
  };
  const Tag = steps.ordered === false ? "ul" : "ol";
  return (
    <section className="markdown-card markdown-steps" aria-label={steps.title ?? gt("Steps")}>
      {steps.title ? <p className="markdown-card-title">{steps.title}</p> : null}
      <Tag
        className="markdown-card-list markdown-steps-list"
        data-ordered={steps.ordered !== false}
      >
        {steps.items.map((item, index) => (
          <li className="markdown-steps-item" key={index}>
            <div className="markdown-steps-head">
              <span className="markdown-steps-label">{item.label}</span>
              {meta(item)}
            </div>
            {item.parallel ? (
              <div className="markdown-steps-parallel">
                <span className="markdown-steps-caption">{gt("In parallel")}</span>
                <div className="markdown-steps-chips">
                  {item.parallel.map((entry, parallelIndex) => (
                    <span className="markdown-steps-chip" key={parallelIndex}>
                      <span>{entry.label}</span>
                      {meta(entry)}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {item.detail ? (
              <details className="markdown-steps-detail">
                <summary>{gt("Details")}</summary>
                {renderMarkdown(item.detail)}
              </details>
            ) : null}
          </li>
        ))}
      </Tag>
    </section>
  );
}
