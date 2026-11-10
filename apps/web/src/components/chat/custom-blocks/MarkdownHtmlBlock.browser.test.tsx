import { expect, it, vi } from "vite-plus/test";

import "~/index.css";
import { render } from "../../../../test/render";
import { MarkdownHtmlBlock } from "./MarkdownHtmlBlock";

it("runs isolated scripts and retains their state until the HTML changes", async () => {
  const html = `<!doctype html><html><body>
    <button id="counter">0</button>
    <script>
      var count = 0;
      var isolated = false;
      try { parent.document.body; } catch { isolated = true; }
      var button = document.getElementById("counter");
      button.onclick = function() { button.textContent = String(++count); };
      function report() {
        parent.postMessage({ type: "custom-html-state", count: count, isolated: isolated }, "*");
      }
      addEventListener("message", function(event) {
        if (event.source !== parent || event.data !== "click-counter") return;
        button.click();
        report();
      });
      report();
    </script>
  </body></html>`;
  const reports: Array<{ count: number; isolated: boolean }> = [];
  const messages = new AbortController();
  using _messages = { [Symbol.dispose]: () => messages.abort() };
  const container = document.createElement("div");
  window.addEventListener(
    "message",
    (event) => {
      if (
        event.source === container.querySelector("iframe")?.contentWindow &&
        event.data?.type === "custom-html-state"
      ) {
        reports.push(event.data);
      }
    },
    { signal: messages.signal },
  );
  using revoked = vi.spyOn(URL, "revokeObjectURL");
  await using screen = await render(<MarkdownHtmlBlock html={html} />, { container });
  await vi.waitFor(() => expect(reports.at(-1)).toMatchObject({ count: 0, isolated: true }));
  const frame = screen.getByTitle("HTML render").element() as HTMLIFrameElement;
  const src = frame.src;
  frame.contentWindow?.postMessage("click-counter", "*");
  await vi.waitFor(() => expect(reports.at(-1)?.count).toBe(1));

  await screen.rerender(<MarkdownHtmlBlock html={html} />);
  expect(screen.getByTitle("HTML render").element()).toBe(frame);
  expect(frame.src).toBe(src);
  frame.contentWindow?.postMessage("click-counter", "*");
  await vi.waitFor(() => expect(reports.at(-1)?.count).toBe(2));

  await screen.rerender(<MarkdownHtmlBlock html={`${html}\n<p>Revised</p>`} />);
  await vi.waitFor(() => expect(reports.at(-1)).toMatchObject({ count: 0, isolated: true }));
  const revisedFrame = screen.getByTitle("HTML render").element() as HTMLIFrameElement;
  expect(revisedFrame).not.toBe(frame);
  expect(revoked).toHaveBeenCalledWith(src.split("#", 1)[0]);
  await screen.unmount();
  expect(revoked).toHaveBeenCalledWith(revisedFrame.src.split("#", 1)[0]);
});

it("fits the page and clamps oversized height reports", async () => {
  const html = `<main style="height: 360px">Interactive page</main><script>
    addEventListener("message", function(event) {
      if (event.source !== parent || event.data !== "oversize") return;
      parent.postMessage({
        jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: 1000000 }
      }, "*");
    });
  </script>`;
  await using screen = await render(<MarkdownHtmlBlock html={html} />);
  const frame = screen.getByTitle("HTML render").element() as HTMLIFrameElement;
  await vi.waitFor(() => expect(frame.getBoundingClientRect().height).toBeGreaterThanOrEqual(360));
  frame.contentWindow?.postMessage("oversize", "*");
  await vi.waitFor(() => expect(frame.getBoundingClientRect().height).toBe(2000));
});
