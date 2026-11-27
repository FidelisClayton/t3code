/* oxlint-disable shadcn/no-unknown-classes -- Feature-local styles are imported from MarkdownSwatchesBlock.css. */
/* oxlint-disable react/no-array-index-key -- Each immutable swatch list remounts when its source changes. */
import { useGT } from "gt-react";
import { inlineMarkdown, type RenderBlockMarkdown } from "./markdownInline";
import type { MarkdownSwatchesDefinition } from "./markdownSwatches";
import "./MarkdownCard.css";
import "./MarkdownSwatchesBlock.css";

export function MarkdownSwatchesBlock({
  swatches,
  renderMarkdown,
}: {
  swatches: MarkdownSwatchesDefinition;
  renderMarkdown: RenderBlockMarkdown;
}) {
  const gt = useGT();
  const md = (text: string) => inlineMarkdown(text, renderMarkdown);
  return (
    <div className="markdown-card markdown-swatches">
      {swatches.title ? <div className="markdown-card-title">{md(swatches.title)}</div> : null}
      <ul className="markdown-card-list markdown-swatches-list">
        {swatches.items.map((item, index) => (
          <li className="markdown-swatches-item" key={index}>
            <i
              className={item.hex ? "markdown-swatch" : "markdown-swatch empty"}
              style={item.hex ? { backgroundColor: item.hex } : undefined}
              aria-hidden="true"
            />
            <span className="markdown-swatches-text">
              <span className="markdown-swatches-label">{md(item.label)}</span>
              <span className="markdown-swatches-meta">
                <span>{md(item.role)}</span>
                {item.hex ? <span className="tabular-nums">{item.hex}</span> : null}
                {item.illustrative ? <span>{gt("Illustrative")}</span> : null}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
