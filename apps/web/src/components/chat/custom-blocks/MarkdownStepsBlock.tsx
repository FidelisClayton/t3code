/* oxlint-disable shadcn/no-unknown-classes -- Feature-local styles are imported from MarkdownStepsBlock.css. */
/* oxlint-disable react/no-array-index-key -- Each immutable steps list remounts when its source changes. */
import { useGT } from "gt-react";
import {
  ChevronDownIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleHelpIcon,
  CircleXIcon,
  ClockIcon,
} from "lucide-react";
import { inlineMarkdown, type RenderBlockMarkdown } from "./markdownInline";
import type { MarkdownStepsDefinition } from "./markdownSteps";
import "./MarkdownDisclosure.css";
import "./MarkdownCard.css";
import "./MarkdownStepsBlock.css";

type Meta = {
  owner?: "user" | "agent" | undefined;
  state?: MarkdownStepsDefinition["items"][number]["state"] | undefined;
};

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
  renderMarkdown: RenderBlockMarkdown;
}) {
  const gt = useGT();
  const md = (text: string) => inlineMarkdown(text, renderMarkdown);
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
      {steps.title ? <div className="markdown-card-title">{md(steps.title)}</div> : null}
      <Tag
        className="markdown-card-list markdown-steps-list"
        data-ordered={steps.ordered !== false}
      >
        {steps.items.map((item, index) => (
          <li className="markdown-steps-item" key={index}>
            {/* A step with a detail is its own disclosure, so it keeps one row until opened. */}
            {item.detail ? (
              <details className="markdown-steps-detail">
                <summary className="markdown-steps-head">
                  <span className="markdown-steps-label">{md(item.label)}</span>
                  <span className="markdown-steps-end">
                    {meta(item)}
                    <ChevronDownIcon aria-hidden="true" className="markdown-steps-chevron" />
                  </span>
                </summary>
                {renderMarkdown(item.detail)}
              </details>
            ) : (
              <div className="markdown-steps-head">
                <span className="markdown-steps-label">{md(item.label)}</span>
                <span className="markdown-steps-end">
                  {meta(item)}
                  <ChevronDownIcon
                    aria-hidden="true"
                    className="markdown-steps-chevron invisible"
                  />
                </span>
              </div>
            )}
            {item.parallel ? (
              <ol className="markdown-steps-parallel" aria-label={gt("In parallel")}>
                {item.parallel.map((entry, parallelIndex) => (
                  <li className="markdown-steps-sub" key={parallelIndex}>
                    <span className="markdown-steps-letter">
                      {steps.ordered === false ? "" : index + 1}
                      {String.fromCharCode(97 + parallelIndex)}
                    </span>
                    <div className="markdown-steps-head">
                      <span className="markdown-steps-label">{md(entry.label)}</span>
                      <span className="markdown-steps-end">
                        {meta({
                          owner: entry.owner === item.owner ? undefined : entry.owner,
                          state: entry.state,
                        })}
                        <ChevronDownIcon
                          aria-hidden="true"
                          className="markdown-steps-chevron invisible"
                        />
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}
          </li>
        ))}
      </Tag>
    </section>
  );
}
