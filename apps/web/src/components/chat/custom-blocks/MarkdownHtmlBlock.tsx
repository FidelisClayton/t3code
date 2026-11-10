import type { ScopedThreadRef } from "@t3tools/contracts";
import {
  clampHtmlRenderHeight,
  HTML_RENDER_MIN_HEIGHT,
  injectHtmlRenderBootstrap,
} from "@t3tools/shared/htmlRender";
import { useEffect, useState } from "react";

import { HtmlRenderDocument } from "../../files/BrowserDocumentFrame";

export function MarkdownHtmlBlock(props: { html: string; threadRef?: ScopedThreadRef }) {
  return <MarkdownHtmlDocument key={props.html} {...props} />;
}

function MarkdownHtmlDocument(props: { html: string; threadRef?: ScopedThreadRef }) {
  const [src, setSrc] = useState<string | null>(null);
  const [height, setHeight] = useState(HTML_RENDER_MIN_HEIGHT);
  const { html } = props;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- owns the sandbox document's Blob URL and releases it on replacement or unmount
  useEffect(() => {
    const url = URL.createObjectURL(
      new Blob([injectHtmlRenderBootstrap(html)], { type: "text/html" }),
    );
    // oxlint-disable-next-line react/set-state-in-effect -- Publish a Blob URL only within the effect that owns its cleanup.
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [html]);

  return (
    <div style={{ blockSize: height }}>
      {src !== null ? (
        <HtmlRenderDocument
          src={src}
          title="HTML render"
          threadRef={props.threadRef}
          className="block size-full"
          onContentHeight={(contentHeight) => setHeight(clampHtmlRenderHeight(contentHeight))}
        />
      ) : null}
    </div>
  );
}
