import { EnvironmentId, MessageId, ThreadId } from "@t3tools/contracts";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import { RegistryContext } from "@effect/atom-react";
import type { OrchestrationV2GetMarkdownReferenceResult } from "@t3tools/contracts";
import { MarkdownReferenceProvider } from "./chat/custom-blocks/MarkdownReferenceScope";
import { useState, type ReactElement } from "react";
import {
  updateMarkdownChoiceDraft,
  type MarkdownChoiceDraftUpdate,
} from "./chat/custom-blocks/markdownChoiceDraft";
import { collectAssistantCitations } from "@t3tools/shared/assistantCitations";
import { findAssistantCitationSourceAnchor } from "../lib/assistantTextSelection";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { act, render } from "../../test/render";
import "../index.css";

import { filesystemEnvironment } from "../state/filesystem";
import { useRightPanelStore } from "../rightPanelStore";
import { chatMarkdownClipboardPayload } from "../markdown-clipboard";
import { setMarkdownTaskChecked } from "@t3tools/shared/markdownTaskList";
import { HostImageUrlContext } from "./chat/hostImageUrl";

const { workspaceSearch, filesystemMetadata } = vi.hoisted(() => ({
  workspaceSearch: vi.fn(),
  filesystemMetadata: vi.fn(),
}));
const referenceLookup = vi.hoisted(() => vi.fn());
vi.mock(import("../state/orchestration"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    orchestrationEnvironment: {
      ...actual.orchestrationEnvironment,
      markdownReference: referenceLookup,
    },
  };
});
const parsedSources = vi.hoisted(() => [] as string[]);
vi.mock(import("mdast-util-from-markdown"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    fromMarkdown: ((source: string, ...rest: never[]) => {
      parsedSources.push(String(source));
      return (actual.fromMarkdown as (...args: unknown[]) => unknown)(source, ...rest);
    }) as typeof actual.fromMarkdown,
  };
});

vi.mock(import("../state/use-atom-query-runner"), async (original) => ({
  ...(await original()),
  useAtomQueryRunner: ((family: unknown) =>
    family === filesystemEnvironment.getMetadata ? filesystemMetadata : workspaceSearch) as never,
}));

// Atoms derived from the server config run in the real registry over a missing config.
vi.mock(import("../state/server"), async (original) => {
  const actual = await original();
  const { Atom } = await import("effect/reactivity");
  const noConfig = Atom.make(null);
  const modelsConfig = Atom.make({
    availableEditors: [],
    settings: { providerInstances: {} },
    providers: [
      {
        instanceId: "codex",
        driver: "codex",
        displayName: "Codex",
        models: [{ slug: "gpt-6.1", name: "GPT-6.1", isCustom: false, capabilities: {} }],
      },
    ],
  });
  return {
    ...actual,
    serverEnvironment: {
      ...actual.serverEnvironment,
      configValueAtom: ((environmentId: string) =>
        environmentId === "models" ? modelsConfig : noConfig) as never,
    },
  };
});
vi.mock(import("../state/session"), async (original) => {
  const { AuthStandardClientScopes } = await import("@t3tools/contracts");
  const granted = new Set<string>(AuthStandardClientScopes);
  const hasScope = (environmentId: unknown, scope: string) =>
    environmentId !== null && granted.has(scope);
  return {
    ...(await original()),
    useEnvironmentScope: hasScope as never,
    readEnvironmentScope: hasScope as never,
  };
});
vi.mock(import("../remoteOpen"), async (original) => ({
  ...(await original()),
  useRemoteOpenResolution: () => ({ state: { mode: "local-exec" }, isResolved: true }) as never,
}));
const { renderDiagram } = vi.hoisted(() => ({
  renderDiagram: vi.fn<(source: string) => Promise<string> | undefined>(),
}));
// Control rendering latency without running Mermaid layout.
vi.mock(import("./chat/MermaidDiagram"), async (original) => {
  const { use } = await import("react");
  return {
    ...(await original()),
    MermaidDiagram: ({ source }: { source: string }) => {
      const pending = renderDiagram(source);
      return <svg role="img" aria-label={pending ? use(pending) : "Diagram"} />;
    },
  };
});

const appearance = vi.hoisted(() => ({
  value: "light" as "light" | "dark",
  listeners: new Set<() => void>(),
}));
vi.mock(import("../hooks/useTheme"), async (original) => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => {
    appearance.listeners.add(listener);
    return () => appearance.listeners.delete(listener);
  };
  return {
    ...(await original()),
    useRenderedAppearance: () => useSyncExternalStore(subscribe, () => appearance.value),
  };
});

const settingsOverrides = vi.hoisted(() => ({ mathRenderingEnabled: false }));
vi.mock(import("../hooks/useSettings"), async (original) => {
  const actual = await original();
  type Settings = ReturnType<typeof actual.getClientSettings>;
  function useClientSettings<T = Settings>(select?: (settings: Settings) => T): T {
    const settings = { ...actual.getClientSettings(), ...settingsOverrides };
    return select ? select(settings) : (settings as T);
  }
  return { ...actual, useClientSettings };
});

import ChatMarkdown from "./ChatMarkdown";
import { AudioPreview } from "./files/AudioPreview";

it("keeps compact audio playback loaded across signed URL renewals", async () => {
  const original =
    "data:audio/wav;base64,UklGRiUAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQEAAACA";
  const renewed = `${original}#renewed`;
  const preview = (src: string, revision = "clip-v1") => (
    <AudioPreview compact name="clip.wav" src={src} revision={revision} />
  );
  await using screen = await render(preview(original));
  const audio = screen.container.querySelector("audio")!;
  await act(() => {
    audio.dispatchEvent(new Event("loadedmetadata"));
    audio.dispatchEvent(new Event("play"));
  });
  await screen.rerender(preview(renewed));
  expect(screen.container.querySelector("audio")).toBe(audio);
  expect(audio.getAttribute("src")).toBe(original);
  await expect.element(screen.getByRole("button", { name: "Pause clip.wav" })).toBeEnabled();
  await screen.rerender(preview(renewed, "clip-v2"));
  expect(screen.container.querySelector("audio")).not.toBe(audio);
  expect(screen.container.querySelector("audio")?.getAttribute("src")).toBe(renewed);
});

function setup() {
  referenceLookup.mockReset();
  appearance.value = "light";
  parsedSources.length = 0;
  settingsOverrides.mathRenderingEnabled = false;
  renderDiagram.mockReset();
  workspaceSearch.mockReset().mockResolvedValue(AsyncResult.success({ entries: [] }));
  filesystemMetadata.mockReset().mockResolvedValue(AsyncResult.success({ entries: [null] }));
}

function renderText(text: string, props: Partial<Parameters<typeof ChatMarkdown>[0]> = {}) {
  return render(<ChatMarkdown cwd="/tmp/project" text={text} {...props} />);
}

function buttonsLabelled(container: HTMLElement, label: string) {
  return [...container.querySelectorAll<HTMLButtonElement>("button")].filter(
    (button) => button.getAttribute("aria-label") === label,
  );
}

it("renders custom forms only after a complete fence and explicit opt-in", async () => {
  setup();
  const source = JSON.stringify({
    title: "Trip",
    fields: [{ type: "text", name: "destination", label: "Destination" }],
  });
  const open = `\`\`\`form\n${source}`;
  const closed = `${open}\n\`\`\``;
  await using screen = await renderText(closed);
  expect(screen.container.querySelector("form")).toBeNull();
  await screen.rerender(<ChatMarkdown cwd={undefined} text={open} customBlocks isStreaming />);
  expect(screen.container.querySelector("form")).toBeNull();
  await screen.rerender(<ChatMarkdown cwd={undefined} text={closed} customBlocks isStreaming />);
  await expect.element(screen.getByRole("textbox", { name: "Destination" })).toBeVisible();
  for (const text of ["```form\n{\n```", "```unknown\n{}\n```", "```html\n<p>source</p>\n```"]) {
    await screen.rerender(<ChatMarkdown cwd={undefined} text={text} customBlocks />);
    expect(screen.container.querySelector("form, iframe")).toBeNull();
    expect(screen.container.querySelector("pre")).not.toBeNull();
  }
});

it("shows unavailable audio when a workspace embed has no thread", async () => {
  setup();
  await using screen = await renderText("![recording](clip.wav)");
  expect(screen.container.textContent).toContain("Audio unavailable");
  expect(screen.container.textContent).not.toContain("Loading audio");
  expect(screen.container.querySelector("audio")).toBeNull();
});

it("loads a host image through the page's own route when there is no environment", async () => {
  setup();
  const pixel =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  const hostImageUrl = vi.fn((_path: string) => pixel);
  await using screen = await render(
    <HostImageUrlContext value={hostImageUrl}>
      <ChatMarkdown cwd={undefined} text="![Shot](</work/my shot.png>)" />
    </HostImageUrlContext>,
  );
  await expect.element(screen.getByAltText("Shot")).toHaveAttribute("src", pixel);
  expect(new Set(hostImageUrl.mock.calls.map(([path]) => path))).toEqual(
    new Set(["/work/my shot.png"]),
  );
});

it("loads the <picture> source for the current theme through the image route", async () => {
  setup();
  const pixel =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  const hostImageUrl = (path: string) => `${pixel}#${path}`;
  await using screen = await render(
    <HostImageUrlContext value={hostImageUrl}>
      <ChatMarkdown
        cwd={undefined}
        text={
          '<picture><source media="(prefers-color-scheme: dark)" srcset="/work/dark.png"><img src="/work/light.png" alt="Shot"></picture>'
        }
      />
    </HostImageUrlContext>,
  );
  await expect
    .element(screen.getByAltText("Shot"))
    .toHaveAttribute("src", `${pixel}#/work/light.png`);

  await act(() => {
    appearance.value = "dark";
    for (const listener of appearance.listeners) listener();
  });
  await expect
    .element(screen.getByAltText("Shot"))
    .toHaveAttribute("src", `${pixel}#/work/dark.png`);
});

it("reuses the parse of a streaming reply's finished blocks when it remounts", async () => {
  setup();
  const message = (
    <ChatMarkdown cwd="/tmp/project" text={"Finished block\n\nStill growing"} isStreaming />
  );
  {
    await using _first = await render(message);
  }
  await using screen = await render(message);
  await expect.element(screen.getByText("Still growing")).toBeVisible();
  expect(parsedSources.filter((source) => source.includes("Finished block"))).toHaveLength(1);
});

it("reuses the parse of a remounted message that has stable extra plugins", async () => {
  setup();
  const parsed = vi.fn();
  const countingPlugins = [() => () => void parsed()];
  const message = (
    <ChatMarkdown cwd="/tmp/project" text="Cached text" extraRemarkPlugins={countingPlugins} />
  );
  {
    await using _first = await render(message);
  }
  await using screen = await render(message);
  await expect.element(screen.getByText("Cached text")).toBeVisible();
  expect(parsed).toHaveBeenCalledTimes(1);
});

describe("ChatMarkdown favicon privacy", () => {
  it("suppresses private link images while preserving public links across updates", async () => {
    setup();
    const markdown = (url: string) => <ChatMarkdown cwd="/tmp/project" text={`[Link](${url})`} />;
    await using screen = await render(markdown("https://example.com"));
    const { container, rerender } = screen;
    expect([...container.querySelectorAll("img")].map((image) => image.src)).toEqual([
      "https://www.google.com/s2/favicons?domain=example.com&sz=32",
    ]);
    for (const url of ["http://192.168.1.10:8080", "http://localhost:3000", "http://home.arpa"]) {
      await rerender(markdown(url));
      expect(container.querySelectorAll("img")).toHaveLength(0);
    }
    await rerender(markdown("https://example.com"));
    expect(container.querySelectorAll("img")).toHaveLength(1);
    await rerender(markdown("https://github.com/pingdotgg/t3code/pull/1"));
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelector("a svg")).not.toBeNull();
  });
});

describe("ChatMarkdown streaming", () => {
  it("runs only a complete single-line shell block after a click", async () => {
    setup();
    const onRunShellCommand = vi.fn();
    const message = (text: string, isStreaming = false) => (
      <ChatMarkdown
        cwd="/tmp/project"
        text={text}
        isStreaming={isStreaming}
        onRunShellCommand={onRunShellCommand}
      />
    );
    await using screen = await render(message("```bash\necho hello\n```", true));
    const { container, rerender } = screen;
    const runButtons = () => buttonsLabelled(container, "Run in terminal");
    expect(runButtons()).toHaveLength(0);

    await rerender(message("```bash\necho hello\n```"));
    await act(async () => runButtons()[0]!.click());
    expect(onRunShellCommand).toHaveBeenCalledExactlyOnceWith("echo hello");

    for (const text of [
      "~~~bash\necho tilde\n~~~",
      "> ```bash\n> echo quote\n> ```",
      "````bash\necho four\n````",
      "- Command\n\n  ```bash\n  echo list\n  ```",
      "```bash\r\necho crlf\r\n```\r",
    ]) {
      await rerender(message(text));
      expect(runButtons()).toHaveLength(1);
    }

    for (const text of [
      "```bash\necho one\necho two\n```",
      "```typescript\necho hello\n```",
      "```bash\n\n```",
      "```bash\necho hello\n\n```",
      "```bash\necho hello\\\n```",
      "```bash\necho safe \u202e#\n```",
      "```bash\necho incomplete",
      "~~~bash\necho incomplete",
      "````bash\necho incomplete\n```",
      '<pre><code class="language-bash">echo html</code></pre>',
    ]) {
      await rerender(message(text));
      expect(runButtons()).toHaveLength(0);
    }
  });

  it("edits the current task text and marker after reusing a renderer", async () => {
    setup();
    let editedText: string | undefined;
    let rerender: (next: ReactElement) => Promise<void> = async () => {};
    const message = (text: string): ReactElement => (
      <ChatMarkdown
        cwd="/tmp/project"
        text={text}
        onTaskListChange={({ markerOffset, checked }) => {
          editedText = setMarkdownTaskChecked(text, markerOffset, checked);
          void rerender(message(editedText));
        }}
      />
    );
    await using rendered = await render(message("- [ ] First\n- [ ] Second"));
    rerender = rendered.rerender;
    const { container } = rendered;
    const checkboxes = () => container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    const original = checkboxes()[1]!;
    await rerender(message("- [ ] A longer first task\n- [ ] Second"));
    expect(checkboxes()[1]).toBe(original);

    await act(async () => original.click());
    expect(editedText).toBe("- [ ] A longer first task\n- [x] Second");
    await vi.waitFor(() => expect(checkboxes()[1]!.checked).toBe(true));
    await rerender(message("- [ ] A longer first task\n- [ ] Second"));
    expect(checkboxes()[1]).toBe(original);
    expect(checkboxes()[1]!.checked).toBe(false);
  });

  it.each([
    ["read-only", undefined],
    ["editable", () => {}],
  ])(
    "unchecks the remaining %s task when the checked row above it is removed",
    async (_, onTaskListChange) => {
      setup();
      const message = (text: string) => (
        <ChatMarkdown cwd="/tmp/project" text={text} onTaskListChange={onTaskListChange} />
      );
      await using screen = await render(message("- [x] Completed item\n- [ ] Pending item"));
      await screen.rerender(message("- [ ] Pending item"));
      const checkboxes =
        screen.container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
      expect(checkboxes).toHaveLength(1);
      expect(checkboxes[0]!.checked).toBe(false);
    },
  );
});

describe("ChatMarkdown workspace file opens", () => {
  const threadRef = {
    environmentId: EnvironmentId.make("workspace"),
    threadId: ThreadId.make("thread"),
  };

  it("keeps a newer absolute file open when an earlier repo-relative lookup finishes", async () => {
    setup();
    const result = AsyncResult.success({
      entries: [{ path: "notes/a.md", kind: "file" }],
      truncated: false,
    });
    let resolvePending!: (value: typeof result) => void;
    const pending = new Promise<typeof result>((resolve) => {
      resolvePending = resolve;
    });
    workspaceSearch.mockReturnValueOnce(pending);
    using openFile = vi
      .spyOn(useRightPanelStore.getState(), "openFile")
      .mockImplementation(() => {});
    await using screen = await renderText(
      "[Notes](physics/notes/a.md) and [Other](/elsewhere/b.md:9)",
      {
        cwd: "/school/physics",
        threadRef,
      },
    );
    const { container } = screen;
    const [notes, other] = container.querySelectorAll("a");
    await act(async () => notes!.click());
    expect(workspaceSearch).toHaveBeenCalledOnce();
    expect(openFile).not.toHaveBeenCalled();

    await act(async () => other!.click());
    await act(async () => resolvePending(result));

    expect(openFile).toHaveBeenCalledExactlyOnceWith(threadRef, "/elsewhere/b.md", 9);
    expect(workspaceSearch).toHaveBeenCalledOnce();
  });
});

describe("ChatMarkdown skill chips", () => {
  it("shows the skill's details and opens its instructions", async () => {
    setup();
    const threadRef = {
      environmentId: EnvironmentId.make("workspace"),
      threadId: ThreadId.make("thread"),
    };
    await using screen = await renderText("Run $review now", {
      threadRef,
      skills: [
        {
          name: "review",
          displayName: "Review",
          description: "Reviews the current branch.",
          path: "/skills/review/SKILL.md",
          enabled: true,
        },
      ],
    });
    using openFile = vi
      .spyOn(useRightPanelStore.getState(), "openFile")
      .mockImplementation(() => {});

    await userEvent.click(screen.getByRole("button", { name: "Skill Review. Show details" }));
    await expect.element(page.getByText("Reviews the current branch.")).toBeVisible();
    await userEvent.click(page.getByRole("button", { name: "View instructions" }));

    expect(openFile).toHaveBeenCalledExactlyOnceWith(threadRef, "/skills/review/SKILL.md");
  });

  it("names a mentioned model as its provider does, without a thread", async () => {
    setup();
    await using screen = await renderText("Ask (model:codex/gpt-6.1), not model:openai/gpt-4o.", {
      environmentId: EnvironmentId.make("models"),
    });

    await expect
      .element(screen.getByRole("button", { name: "Model GPT-6.1. Show details" }))
      .toBeVisible();
    expect(buttonsLabelled(screen.container, "Model gpt-4o. Show details")).toEqual([]);
    expect(screen.container.textContent).toBe("Ask (GPT-6.1), not model:openai/gpt-4o.");
  });
});

describe("ChatMarkdown headings", () => {
  it("never gives two headings the same id, even when a suffix matches another heading", async () => {
    setup();
    await using screen = await renderText(
      '## Setup\n\n## Setup\n\n## Setup-1\n\n<h2 id="install-1">Pinned</h2>\n\n## Install\n\n## Install',
      { parseRawHtml: true },
    );
    const { container } = screen;
    expect([...container.querySelectorAll("h2")].map((heading) => heading.id)).toEqual([
      "user-content-setup",
      "user-content-setup-1",
      "user-content-setup-1-1",
      "user-content-install-1",
      "user-content-install",
      "user-content-install-2",
    ]);
  });
});

describe("ChatMarkdown inline code selection", () => {
  it("selects the whole inline code span on double-click, but only a word in fenced code", async () => {
    setup();
    await using screen = await renderText(
      "Run `migration-gate --dry-run` first.\n\n```txt\nfenced-block word\n```",
    );
    await userEvent.dblClick(screen.getByText("migration-gate --dry-run"));
    expect(window.getSelection()?.toString()).toBe("migration-gate --dry-run");

    window.getSelection()?.removeAllRanges();
    const fenced = screen.container.querySelector("pre code")!;
    await userEvent.dblClick(fenced, { position: { x: 4, y: 4 } });
    expect(window.getSelection()?.toString()).toBe("fenced");
  });
});

describe("ChatMarkdown file chip tooltips", () => {
  it("wraps a long path so its file name stays inside the tooltip", async () => {
    setup();
    const path =
      "/tmp/project/packages/client-runtime/src/state/generated/environment-connection-handshake-retry-policy-fixtures.ts";
    await using screen = await renderText(`See [the fixtures](${path}).`);

    await userEvent.hover(screen.container.querySelector(".chat-markdown-file-link")!);
    const tooltip = page.getByText(path);
    await expect.element(tooltip).toBeVisible();

    const popup = tooltip.element().closest("[data-side]")!;
    const pathEnd = document.createRange();
    pathEnd.selectNodeContents(tooltip.element());
    expect(pathEnd.getBoundingClientRect().right).toBeLessThanOrEqual(
      popup.getBoundingClientRect().right,
    );
  });
});

describe("ChatMarkdown editor deep links", () => {
  const hrefs = (container: HTMLElement) =>
    [...container.querySelectorAll("a")].map((link) => link.getAttribute("href"));

  it("keeps local editor file links", async () => {
    setup();
    await using screen = await renderText(
      "[file.md line 3](cursor://file/Users/me/repo/file.md:3) and [same](vscode://file/Users/me/repo/file.md:3:7)",
    );
    expect(hrefs(screen.container)).toEqual([
      "cursor://file/Users/me/repo/file.md:3",
      "vscode://file/Users/me/repo/file.md:3:7",
    ]);
  });

  it("still drops other editor links and unknown schemes", async () => {
    setup();
    await using screen = await renderText(
      "[prompt](cursor://anysphere.cursor-deeplink/prompt?text=hi) [user](cursor://me@file/Users/me/file.md) [unknown](foo://file/Users/me/file.md)",
    );
    expect(screen.container.innerHTML).not.toContain("://");
    expect(hrefs(screen.container).filter(Boolean)).toEqual([]);
  });
});

describe("ChatMarkdown Windows file links", () => {
  const environmentId = EnvironmentId.make("env-windows");
  const renderWindows = (text: string, parseRawHtml: boolean) =>
    renderText(text, {
      cwd: "C:/Users/shawn/project",
      environmentId,
      lineBreaks: !parseRawHtml,
      parseRawHtml,
    });
  const fileHrefs = (container: HTMLElement) =>
    [...container.querySelectorAll(".chat-markdown-file-link")].map((chip) =>
      chip.getAttribute("href"),
    );

  it("still rejects unsafe schemes", async () => {
    setup();
    for (const parseRawHtml of [true, false]) {
      await using screen = await renderWindows(
        "[unsafe](javascript:alert(1)) and [unknown](d:alert(1))",
        parseRawHtml,
      );
      const { container } = screen;
      expect(container.innerHTML).not.toContain("javascript:");
      expect(container.innerHTML).not.toContain("d:alert");
      expect(fileHrefs(container)).toEqual([]);
    }
  });
});

describe("ChatMarkdown inline choices", () => {
  const choices =
    "Choose [Parallel](choice:personas/parallel) or [Serial](choice:personas/serial).\n\nVerify [Unit tests](choices:verify/unit) and [Browser](choices:verify/browser).";

  it("stages source-backed choices without sending or stealing focus, restores marks without restaging", async () => {
    setup();
    const threadRef = {
      environmentId: EnvironmentId.make("choice-env"),
      threadId: ThreadId.make("choice-thread"),
    };
    const messageId = MessageId.make("choice-message");
    localStorage.removeItem(
      `t3code:markdown-choices:v1:${JSON.stringify([threadRef.environmentId, threadRef.threadId, messageId])}`,
    );
    const recapChoices =
      "```recap\n" +
      JSON.stringify({
        lead: "Current work",
        items: [
          {
            label: "Task",
            status: "running",
            summary: "Pick detail coverage",
            details:
              "Use [Detail tests](choices:detail/tests) or [Detail serial](choice:personas/detail).",
            reference: "issue/TASK-CHOICES",
          },
        ],
      }) +
      "\n```";
    const referenceChoices =
      "```reference\n" +
      JSON.stringify({
        id: "issue/TASK-CHOICES",
        title: "Task context",
        body: "[Briefing option](choices:briefing/option)",
      }) +
      "\n```";
    const fullText = `${choices}\n\n${recapChoices}\n\n${referenceChoices}`;
    let composerReady = false;
    const send = vi.fn();
    function ChoiceDraft({ revision = 0 }: { revision?: number }) {
      const [draft, setDraft] = useState("My typed answer");
      return (
        <>
          <div data-assistant-citation-viewport="true">
            <div
              data-assistant-citation-source={messageId}
              data-assistant-citation-environment={threadRef.environmentId}
              data-assistant-citation-thread={threadRef.threadId}
            >
              <ChatMarkdown
                key={revision}
                cwd="/workspace"
                text={fullText}
                customBlocks
                threadRef={threadRef}
                messageId={messageId}
                onSendAppMessage={send}
                onChoiceDraftUpdate={(update: MarkdownChoiceDraftUpdate) => {
                  if (!composerReady) return false;
                  setDraft((current) => updateMarkdownChoiceDraft(current, update));
                  return true;
                }}
              />
            </div>
          </div>
          <textarea
            aria-label="Draft"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            onClick={() => {
              send(draft);
              setDraft("");
            }}
          >
            Send
          </button>
        </>
      );
    }
    await using screen = await render(<ChoiceDraft />);
    const draft = screen.getByRole("textbox", { name: "Draft" });
    await userEvent.click(screen.getByRole("radio", { name: "Parallel", exact: true }));
    await expect
      .element(screen.getByRole("radio", { name: "Parallel", exact: true }))
      .toHaveAttribute("aria-checked", "false");
    await expect.element(draft).toHaveValue("My typed answer");
    composerReady = true;
    await userEvent.click(screen.getByRole("radio", { name: "Parallel", exact: true }));
    await expect
      .element(screen.getByRole("radio", { name: "Parallel", exact: true }))
      .toHaveFocus();
    const readDraft = () =>
      (screen.container.querySelector("textarea[aria-label=Draft]") as HTMLTextAreaElement).value;
    expect(readDraft()).toContain("My typed answer\nSelected personas/parallel:");
    const first = collectAssistantCitations(readDraft())[0]!.citation;
    expect(first.text).toBe("Parallel");
    expect(findAssistantCitationSourceAnchor(document, first)?.range.toString()).toBe("Parallel");
    await userEvent.keyboard("{ArrowRight}");
    expect(readDraft()).not.toContain("Selected personas/parallel:");
    expect(readDraft()).toContain("Selected personas/serial:");
    await userEvent.click(screen.getByRole("checkbox", { name: "Unit tests", exact: true }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Browser", exact: true }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Unit tests", exact: true }));
    expect(readDraft()).not.toContain("Selected verify/unit:");
    expect(readDraft()).toContain("Selected verify/browser:");
    const commentButton = screen.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Comment on Parallel"]',
    )!;
    commentButton.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.type(
      page.getByRole("textbox", { name: "Comment on selected text" }),
      "Discuss the tradeoff",
    );
    composerReady = false;
    await userEvent.click(page.getByRole("button", { name: "Save", exact: true }));
    await expect
      .element(page.getByRole("textbox", { name: "Comment on selected text" }))
      .toHaveValue("Discuss the tradeoff");
    expect(readDraft()).not.toContain("Comment on unselected personas/parallel:");
    composerReady = true;
    await userEvent.click(page.getByRole("button", { name: "Save", exact: true }));
    expect(readDraft()).toContain("Comment on unselected personas/parallel:");
    expect(collectAssistantCitations(readDraft()).at(-1)?.citation.comment).toBe(
      "Discuss the tradeoff",
    );
    await userEvent.click(screen.getByRole("button", { name: "Task", exact: true }));
    await userEvent.click(page.getByRole("checkbox", { name: "Briefing option", exact: true }));
    expect(readDraft()).not.toContain("briefing/option");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByText("Pick detail coverage", { exact: true }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Detail tests", exact: true }));
    expect(readDraft()).toContain("Selected detail/tests:");
    const detailCitation = collectAssistantCitations(readDraft()).at(-1)!.citation;
    expect(detailCitation.text).toBe("Detail tests");
    expect(findAssistantCitationSourceAnchor(document, detailCitation)?.range.toString()).toBe(
      "Detail tests",
    );
    await userEvent.click(screen.getByRole("radio", { name: "Detail serial", exact: true }));
    await expect
      .element(screen.getByRole("radio", { name: "Serial", exact: true }))
      .toHaveAttribute("aria-checked", "false");
    expect(readDraft()).not.toContain("Selected personas/serial:");
    expect(readDraft()).toContain("Selected personas/detail:");
    const detailComment = screen.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Comment on Detail serial"]',
    )!;
    detailComment.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.type(
      page.getByRole("textbox", { name: "Comment on selected text" }),
      "Keep the detail tradeoff",
    );
    await userEvent.click(page.getByRole("button", { name: "Save", exact: true }));
    await userEvent.click(screen.getByRole("radio", { name: "Serial", exact: true }));
    await expect
      .element(screen.getByRole("radio", { name: "Detail serial", exact: true }))
      .toHaveAttribute("aria-checked", "false");
    expect(readDraft()).not.toContain("Selected personas/detail:");
    expect(readDraft()).toContain("Comment on unselected personas/detail:");
    const displaced = collectAssistantCitations(readDraft()).find(
      ({ citation }) => citation.text === "Detail serial",
    )!.citation;
    expect(displaced.comment).toBe("Keep the detail tradeoff");
    expect(findAssistantCitationSourceAnchor(document, displaced)?.range.toString()).toBe(
      "Detail serial",
    );
    await userEvent.click(screen.getByRole("checkbox", { name: "Unit tests", exact: true }));
    expect(readDraft()).toContain("Selected verify/unit:");
    expect(send).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Send", exact: true }));
    await expect.element(draft).toHaveValue("");
    await screen.rerender(<ChoiceDraft revision={1} />);
    await expect
      .element(screen.getByRole("radio", { name: "Serial", exact: true }))
      .toHaveAttribute("aria-checked", "true");
    await expect
      .element(screen.getByRole("checkbox", { name: "Browser", exact: true }))
      .toHaveAttribute("aria-checked", "true");
    await expect.element(draft).toHaveValue("");
    await expect
      .element(screen.getByRole("radio", { name: "Parallel", exact: true }))
      .toHaveAttribute("aria-description", "Has comment");
    await userEvent.click(screen.getByText("Pick detail coverage", { exact: true }));
    await expect
      .element(screen.getByRole("checkbox", { name: "Detail tests", exact: true }))
      .toHaveAttribute("aria-checked", "true");
    await expect
      .element(screen.getByRole("checkbox", { name: "Unit tests", exact: true }))
      .toHaveAttribute("aria-checked", "true");
    expect(findAssistantCitationSourceAnchor(document, detailCitation)?.range.toString()).toBe(
      "Detail tests",
    );
    await expect.element(draft).toHaveValue("");
    expect(send).toHaveBeenCalledTimes(1);
    expect(findAssistantCitationSourceAnchor(document, first)?.range.toString()).toBe("Parallel");
  });

  it("navigates single choices with wrapping arrows and keeps groups and messages isolated", async () => {
    setup();
    await using screen = await render(
      <>
        <ChatMarkdown cwd="/workspace" text={choices} customBlocks />
        <ChatMarkdown
          cwd="/workspace"
          text="[Other message](choice:personas/parallel) [Only](choice:solo/only)"
          customBlocks
        />
      </>,
    );
    const parallel = screen.getByText("Parallel", { exact: true });
    const serial = screen.getByText("Serial", { exact: true });
    await userEvent.tab();
    await expect.element(parallel).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(serial).toHaveFocus();
    await expect.element(serial).toHaveAttribute("aria-checked", "true");
    await expect.element(parallel).toHaveAttribute("tabindex", "-1");
    await expect.element(serial).toHaveAttribute("tabindex", "0");
    for (const [key, target] of [
      ["ArrowDown", parallel],
      ["ArrowUp", serial],
      ["ArrowLeft", parallel],
      ["ArrowRight", serial],
    ] as const) {
      await userEvent.keyboard(`{${key}}`);
      await expect.element(target).toHaveFocus();
      await expect.element(target).toHaveAttribute("aria-checked", "true");
    }
    await expect.element(serial).toHaveFocus();
    await expect.element(serial).toHaveAttribute("aria-checked", "true");
    await expect.element(parallel).toHaveAttribute("aria-checked", "false");
    await userEvent.keyboard("{Enter}");
    await expect.element(serial).toHaveAttribute("aria-checked", "false");
    await expect.element(parallel).toHaveAttribute("tabindex", "0");
    await expect.element(serial).toHaveAttribute("tabindex", "-1");
    await userEvent.keyboard(" ");
    await expect.element(serial).toHaveAttribute("aria-checked", "true");
    await userEvent.tab();
    await expect
      .element(screen.getByRole("button", { name: "Comment on Serial", exact: true }))
      .toHaveFocus();
    await userEvent.tab({ shift: true });
    await expect.element(serial).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.tab();
    await userEvent.tab();
    await expect
      .element(screen.getByRole("button", { name: "Comment on Serial", exact: true }))
      .toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect
      .element(page.getByRole("textbox", { name: "Comment on selected text" }))
      .toHaveFocus();
    await userEvent.keyboard("Keep this alternative{Enter}");
    await expect
      .element(page.getByRole("textbox", { name: "Comment on selected text" }))
      .not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Edit comment on Serial", exact: true }),
    );
    await expect
      .element(page.getByRole("textbox", { name: "Comment on selected text" }))
      .toHaveValue("Keep this alternative");
    await userEvent.keyboard("{Escape}");
    const unit = screen.getByRole("checkbox", { name: "Unit tests", exact: true });
    const browser = screen.getByRole("checkbox", { name: "Browser", exact: true });
    await userEvent.click(unit);
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(unit).toHaveFocus();
    await userEvent.keyboard(" ");
    await expect.element(unit).toHaveAttribute("aria-checked", "false");
    await userEvent.keyboard("{Enter}");
    await userEvent.click(browser);
    await expect.element(unit).toHaveAttribute("aria-checked", "true");
    await expect.element(browser).toHaveAttribute("aria-checked", "true");
    await expect.element(unit).toHaveAttribute("tabindex", "0");
    await expect.element(browser).toHaveAttribute("tabindex", "0");
    const other = screen.getByRole("radio", { name: "Other message", exact: true });
    await expect.element(other).toHaveAttribute("aria-checked", "false");
    await userEvent.click(other);
    await userEvent.keyboard("{ArrowLeft}{ArrowDown}");
    await expect.element(other).toHaveFocus();
    await expect.element(other).toHaveAttribute("aria-checked", "true");
    await expect.element(parallel).toHaveAttribute("aria-checked", "true");
    await expect
      .element(screen.getByRole("radio", { name: "Only", exact: true }))
      .toHaveAttribute("aria-checked", "false");
  });

  it("keeps streamed choices and comments local, including notes on unselected alternatives", async () => {
    setup();
    await using screen = await render(
      <>
        <ChatMarkdown cwd="/workspace" text={choices} customBlocks isStreaming />
        <ChatMarkdown
          cwd="/workspace"
          text="[Other message](choice:personas/parallel)"
          customBlocks
        />
      </>,
    );
    const parallel = screen.getByRole("radio", { name: "Parallel", exact: true });
    const serial = screen.getByRole("radio", { name: "Serial", exact: true });
    await userEvent.tab();
    await expect.element(parallel).toHaveFocus();
    await userEvent.tab();
    const comment = screen.getByRole("button", { name: "Comment on Parallel", exact: true });
    await expect.element(comment).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    const input = page.getByRole("textbox", { name: "Comment on selected text" });
    await expect.element(input).toHaveFocus();
    expect(screen.container.querySelector('[data-slot="popover-popup"]')).toBeNull();
    const viewport = document.querySelector<HTMLElement>('[data-slot="popover-viewport"]')!;
    expect(viewport.scrollHeight).toBeLessThanOrEqual(viewport.clientHeight);
    await expect.element(parallel).toHaveAttribute("aria-checked", "false");
    await userEvent.fill(input, "Prefer this when tasks are independent");
    await userEvent.keyboard("{Enter}");
    await expect.element(parallel).toHaveFocus();
    await expect
      .element(screen.getByRole("button", { name: "Edit comment on Parallel" }))
      .toBeVisible();
    await userEvent.click(parallel);
    await userEvent.click(serial);
    await expect.element(parallel).toHaveAttribute("aria-checked", "false");
    await expect.element(serial).toHaveAttribute("aria-checked", "true");
    await expect
      .element(screen.getByRole("radio", { name: "Other message", exact: true }))
      .toHaveAttribute("aria-checked", "false");
    await userEvent.click(screen.getByRole("checkbox", { name: "Unit tests", exact: true }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Browser", exact: true }));
    await expect
      .element(screen.getByRole("checkbox", { name: "Unit tests", exact: true }))
      .toHaveAttribute("aria-checked", "true");
    await expect
      .element(screen.getByRole("checkbox", { name: "Browser", exact: true }))
      .toHaveAttribute("aria-checked", "true");
    await screen.rerender(
      <>
        <ChatMarkdown
          cwd="/workspace"
          text={`${choices}\n\nMore streamed text.`}
          customBlocks
          isStreaming
        />
        <ChatMarkdown
          cwd="/workspace"
          text="[Other message](choice:personas/parallel)"
          customBlocks
        />
      </>,
    );
    await expect.element(serial).toHaveAttribute("aria-checked", "true");
    await userEvent.hover(parallel);
    await userEvent.click(screen.getByRole("button", { name: "Edit comment on Parallel" }));
    await expect.element(input).toHaveValue("Prefer this when tasks are independent");
    await userEvent.fill(input, "");
    await userEvent.click(page.getByRole("button", { name: "Save", exact: true }));
    await expect
      .element(screen.getByRole("button", { name: "Comment on Parallel", exact: true }))
      .toBeVisible();
  });

  it("uses shared draft dismissal, validation and IME behavior without selecting or sending", async () => {
    setup();
    const onSendAppMessage = vi.fn();
    await using screen = await render(
      <>
        <ChatMarkdown
          cwd="/workspace"
          text="[Parallel](choice:g/a)"
          customBlocks
          onSendAppMessage={onSendAppMessage}
        />
        <button type="button" className="fixed bottom-0 end-0">
          Outside
        </button>
      </>,
    );
    const phrase = screen.getByRole("radio", { name: "Parallel", exact: true });
    const open = async (name = "Comment on Parallel") => {
      await userEvent.hover(phrase);
      await userEvent.click(screen.getByRole("button", { name, exact: true }));
    };
    await open();
    const input = page.getByRole("textbox", { name: "Comment on selected text" });
    await userEvent.fill(input, "keep on outside");
    await userEvent.click(screen.getByText("Outside", { exact: true }));
    await open("Edit comment on Parallel");
    await expect.element(input).toHaveValue("keep on outside");
    await userEvent.fill(input, "cancel this");
    await userEvent.keyboard("{Escape}");
    await open("Edit comment on Parallel");
    await expect.element(input).toHaveValue("keep on outside");
    await userEvent.fill(input, "x".repeat(8001));
    await userEvent.click(screen.getByText("Outside", { exact: true }));
    await expect.element(input).toHaveAttribute("aria-invalid", "true");
    await userEvent.fill(input, "IME draft");
    await act(() =>
      input
        .element()
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: true }),
        ),
    );
    await expect.element(input).toBeVisible();
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    await expect.element(input).toHaveValue("IME draft\n");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await expect.element(phrase).toHaveAttribute("aria-checked", "false");
    expect(onSendAppMessage).not.toHaveBeenCalled();
    await open("Edit comment on Parallel");
    await userEvent.fill(input, "saved on Tab");
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    await expect.element(input).not.toBeInTheDocument();
    await open("Edit comment on Parallel");
    await expect.element(input).toHaveValue("saved on Tab");
  });

  it("targets block-local comments without selecting options or sharing notes between messages", async () => {
    setup();
    await using screen = await render(
      <>
        {/* Expose the touch-only trigger in the fine-pointer browser fixture. */}
        <style>{"[data-choice-tail] { display: inline-block !important; }"}</style>
        <ChatMarkdown cwd="/workspace" text={choices} customBlocks />
        <ChatMarkdown cwd="/workspace" text="[Other](choice:personas/parallel)" customBlocks />
      </>,
    );
    const tails = screen.container.querySelectorAll<HTMLButtonElement>("[data-choice-tail]");
    expect(tails).toHaveLength(3);
    const firstTail = tails[0]!;
    const input = page.getByRole("textbox", { name: "Comment on selected text" });
    await userEvent.click(firstTail);
    await expect
      .element(
        page
          .getByRole("radiogroup", { name: "Comment source" })
          .getByRole("radio", { name: "Parallel", exact: true }),
      )
      .toBeChecked();
    await userEvent.click(page.getByRole("button", { name: "Cancel", exact: true }));
    await userEvent.click(screen.getByText("Serial", { exact: true }));
    const parsesBeforeOpen = parsedSources.length;
    await userEvent.click(firstTail);
    await expect
      .element(
        page
          .getByRole("radiogroup", { name: "Comment source" })
          .getByRole("radio", { name: "Serial", exact: true }),
      )
      .toBeChecked();
    await userEvent.fill(input, "Serial note");
    await userEvent.click(
      page
        .getByRole("radiogroup", { name: "Comment source" })
        .getByRole("radio", { name: "Parallel", exact: true }),
    );
    await expect.element(input).toHaveValue("");
    await userEvent.fill(input, "Unselected alternative");
    await userEvent.click(page.getByRole("button", { name: "Save", exact: true }));
    await expect
      .element(screen.getByText("Parallel", { exact: true }))
      .toHaveAttribute("aria-checked", "false");
    await expect
      .element(screen.getByText("Parallel", { exact: true }))
      .toHaveAttribute("aria-description", "Has comment");
    await expect
      .element(screen.getByText("Serial", { exact: true }))
      .toHaveAttribute("aria-checked", "true");
    await expect
      .element(screen.getByText("Serial", { exact: true }))
      .toHaveAttribute("aria-description", "Has comment");
    await userEvent.click(firstTail);
    await expect.element(input).toHaveValue("Serial note");
    await userEvent.fill(input, "Discard me");
    await userEvent.click(page.getByRole("button", { name: "Cancel", exact: true }));
    await userEvent.click(firstTail);
    await expect.element(input).toHaveValue("Serial note");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(tails[1]!);
    await expect
      .element(
        page
          .getByRole("radiogroup", { name: "Comment source" })
          .getByRole("radio", { name: "Unit tests", exact: true }),
      )
      .toBeChecked();
    await expect.element(input).toHaveValue("");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(tails[2]!);
    await expect.element(input).toHaveValue("");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(firstTail);
    await userEvent.fill(input, "x".repeat(8001));
    await userEvent.click(
      page
        .getByRole("radiogroup", { name: "Comment source" })
        .getByRole("radio", { name: "Parallel", exact: true }),
    );
    await expect.element(input).toHaveAttribute("aria-invalid", "true");
    await expect
      .element(
        page
          .getByRole("radiogroup", { name: "Comment source" })
          .getByRole("radio", { name: "Serial", exact: true }),
      )
      .toBeChecked();
    await expect.element(input).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(parsedSources.length).toBe(parsesBeforeOpen);
  });

  it.each([
    "- [One](choice:g/one) or [Two](choice:g/two).\n  - [Nested](choice:nested/one)",
    "- [One](choice:g/one) or [Two](choice:g/two).\n\n  More detail.\n\n  - [Nested](choice:nested/one)",
  ])("renders one tail per decision in tight and loose nested lists: %s", async (text) => {
    setup();
    await using screen = await render(<ChatMarkdown cwd="/workspace" text={text} customBlocks />);
    const tails = screen.container.querySelectorAll("[data-choice-tail]");
    expect(tails).toHaveLength(2);
    expect(tails[0]!.compareDocumentPosition(tails[1]!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      screen.container
        .querySelectorAll("[data-choice-tail]")[0]
        ?.closest("li")
        ?.querySelectorAll(":scope > [data-choice-tail], :scope > p > [data-choice-tail]"),
    ).toHaveLength(1);
  });

  it("rejects malformed and conflicting choices while ordinary Markdown keeps working", async () => {
    setup();
    await using screen = await renderText(
      "[Single](choice:g/a) [Multi](choices:g/b) [Bad](choice:g/a?x=1) [Encoded](choice:g/%61) [Docs](https://example.com)\n\n`[Code](choice:g/a)`",
      { customBlocks: true },
    );
    await expect.element(screen.getByText("Single", { exact: true })).toBeVisible();
    expect(screen.container.querySelectorAll("button[aria-checked]")).toHaveLength(0);
    expect(screen.container.innerHTML).not.toContain('href="choice:');
    await expect
      .element(screen.getByRole("link", { name: "Docs" }))
      .toHaveAttribute("href", "https://example.com");
    await expect.element(screen.getByText("[Code](choice:g/a)", { exact: true })).toBeVisible();
    await screen.rerender(<ChatMarkdown cwd="/workspace" text="[Assistant only](choice:g/a)" />);
    expect(screen.container.querySelectorAll("button[aria-checked]")).toHaveLength(0);
  });
});

const referenceMention = "Read [E-406](ref:linear/E-406).";
function referenceDeclaration(
  title = "E-406 · Medical Servicing answer",
  body = "The answer is **Brookhaven Orthopedics**.",
) {
  return (
    "```reference\n" +
    JSON.stringify({ id: "linear/E-406", title, summary: "Owns the Servicing screens.", body }) +
    "\n```"
  );
}

it("resolves same-message references, hides valid declarations and renders safe nonrecursive rich briefings", async () => {
  setup();
  const body =
    "**Details** and [another mention](ref:linear/E-406).\n\n[Ordinary link](https://example.com)\n\n```form\n" +
    JSON.stringify({ title: "Feedback", fields: [{ type: "text", name: "note", label: "Note" }] }) +
    "\n```";
  await using screen = await renderText(
    referenceMention + "\n\n" + referenceDeclaration(undefined, body),
    { customBlocks: true },
  );
  expect(screen.container.textContent).not.toContain('"id":');
  await userEvent.click(screen.getByRole("button", { name: "E-406", exact: true }));
  const dialog = page.getByRole("dialog");
  await expect.element(dialog).toBeVisible();
  await expect.element(dialog.getByText("E-406 · Medical Servicing answer")).toBeVisible();
  expect(dialog.element().querySelector("strong")?.textContent).toBe("Details");
  await expect.element(dialog.getByRole("textbox", { name: "Note" })).toBeVisible();
  await expect
    .element(dialog.getByRole("link", { name: "Ordinary link" }))
    .toHaveAttribute("href", "https://example.com");
  await expect
    .element(dialog.getByRole("button", { name: "another mention" }))
    .not.toBeInTheDocument();
  expect(referenceLookup).not.toHaveBeenCalled();
  await userEvent.click(dialog.getByRole("button", { name: "Close briefing" }));
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  await expect.element(screen.getByRole("button", { name: "E-406", exact: true })).toHaveFocus();
});

it("retains the newest conversation definition when its defining row is unmounted and isolates scopes", async () => {
  setup();
  const messages = [
    { id: "old", text: referenceDeclaration("Old") },
    { id: "new", text: referenceDeclaration("Latest") },
  ];
  await using screen = await render(
    <MarkdownReferenceProvider key="environment-a/thread-a" messages={messages}>
      <ChatMarkdown text={referenceMention} cwd="/tmp/project" customBlocks />
    </MarkdownReferenceProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "E-406", exact: true }));
  await expect.element(page.getByRole("dialog").getByText("Latest", { exact: true })).toBeVisible();
  await screen.rerender(
    <MarkdownReferenceProvider key="environment-b/thread-a" messages={[]}>
      <ChatMarkdown text={referenceMention} cwd="/tmp/project" customBlocks />
    </MarkdownReferenceProvider>,
  );
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "E-406", exact: true }));
  await expect
    .element(screen.getByRole("button", { name: "E-406", exact: true }))
    .not.toBeInTheDocument();
  await expect.element(screen.getByText("E-406", { exact: true })).toBeVisible();
});

it("quiets open custom declarations and publishes them when closed", async () => {
  setup();
  const closed = referenceDeclaration();
  await using screen = await renderText(referenceMention + "\n\n" + closed.slice(0, -3), {
    customBlocks: true,
    isStreaming: true,
  });
  expect(screen.container.textContent).not.toContain('"id":');
  await expect.element(screen.getByText("Preparing component…", { exact: true })).toBeVisible();
  await screen.rerender(
    <ChatMarkdown
      text={referenceMention + "\n\n" + closed}
      cwd="/tmp/project"
      customBlocks
      isStreaming
    />,
  );
  expect(screen.container.textContent).not.toContain('"id":');
  await userEvent.click(screen.getByRole("button", { name: "E-406", exact: true }));
  await expect
    .element(page.getByRole("dialog").getByText("E-406 · Medical Servicing answer"))
    .toBeVisible();
});

it("keeps stopped, invalid, ordinary and opted-out fences readable", async () => {
  setup();
  await using screen = await renderText("```recap\n{secret", {
    customBlocks: true,
    isStreaming: true,
  });
  for (const language of ["reference", "recap", "form", "html render"]) {
    for (const body of ["", "{secret"]) {
      await screen.rerender(
        <ChatMarkdown
          cwd="/tmp/project"
          text={`\`\`\`${language}\n${body}`}
          customBlocks
          isStreaming
        />,
      );
      await expect.element(screen.getByText("Preparing component…", { exact: true })).toBeVisible();
      const placeholder = screen.container.querySelector("[data-assistant-citation-ignore]");
      expect(placeholder?.getAttribute("data-markdown-copy")).toBe("");
      expect(placeholder?.getAttribute("data-thread-find-ignore")).toBe("true");
      expect(screen.container.textContent).not.toContain("{secret");
    }
  }
  for (const [text, customBlocks, isStreaming] of [
    ["```recap\n{secret", true, false],
    ["```recap\n{secret\n```", true, true],
    ["```recap extra\n{secret", true, true],
    ["```referenceMore\n{secret", true, true],
    ["```json\n{secret", true, true],
    ["```html\n{secret", true, true],
    ["```form\n{secret", false, true],
  ] as const) {
    await screen.rerender(
      <ChatMarkdown
        cwd="/tmp/project"
        text={text}
        customBlocks={customBlocks}
        isStreaming={isStreaming}
      />,
    );
    expect(screen.container.textContent).toContain("{secret");
    expect(screen.container.textContent).not.toContain("Preparing component…");
  }
});
it("keeps reference schemes inert outside assistant custom blocks", async () => {
  setup();
  await using screen = await renderText(referenceMention + "\n\n" + referenceDeclaration());
  await expect
    .element(screen.getByRole("button", { name: "E-406", exact: true }))
    .not.toBeInTheDocument();
  expect(screen.container.textContent).toContain('"id":');
  expect(screen.container.querySelector('a[href^="ref:"]')).toBeNull();
});

it("opens on focus, pins with Space and Enter, and closes on Escape without reopening on restored focus", async () => {
  setup();
  await using screen = await render(
    <>
      <ChatMarkdown
        text={referenceMention + "\n\n" + referenceDeclaration()}
        cwd="/tmp/project"
        customBlocks
      />
      <button>Next action</button>
    </>,
  );
  const trigger = screen.getByRole("button", { name: "E-406", exact: true });
  await userEvent.tab();
  await expect.element(trigger).toHaveFocus();
  await expect.element(page.getByRole("dialog")).toBeVisible();
  await userEvent.keyboard(" ");
  await userEvent.tab();
  await expect
    .element(page.getByRole("dialog").getByRole("button", { name: "Close briefing" }))
    .toHaveFocus();
  await userEvent.keyboard("{Escape}");
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  await expect.element(trigger).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  await expect.element(page.getByRole("dialog")).toBeVisible();
  await userEvent.keyboard("{Enter}");
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  await userEvent.keyboard("{Enter}");
  await userEvent.tab();
  await userEvent.tab();
  await expect.element(screen.getByRole("button", { name: "Next action" })).toHaveFocus();
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
});

it("keeps a hover briefing open while the pointer travels into it and pins a hovered briefing", async () => {
  setup();
  await using screen = await renderText(referenceMention + "\n\n" + referenceDeclaration(), {
    customBlocks: true,
  });
  const trigger = screen.getByRole("button", { name: "E-406", exact: true });
  await userEvent.hover(trigger);
  await expect.element(page.getByRole("dialog")).toBeVisible();
  await userEvent.hover(page.getByRole("dialog"));
  await expect.element(page.getByRole("dialog")).toBeVisible();
  await userEvent.click(trigger);
  await userEvent.hover(screen.getByText("Read", { exact: false }));
  await expect.element(page.getByRole("dialog")).toBeVisible();
});

it("looks up old saved definitions only while open, shows pending and error states and permits retry", async () => {
  setup();
  const registry = AtomRegistry.make();
  using _registry = { [Symbol.dispose]: () => registry.dispose() };
  const result = Atom.make<
    AsyncResult.AsyncResult<OrchestrationV2GetMarkdownReferenceResult, Error>
  >(AsyncResult.waiting(AsyncResult.success({ reference: null })));
  referenceLookup.mockReturnValue(result);
  const threadRef = {
    environmentId: EnvironmentId.make("env-a"),
    threadId: ThreadId.make("thread-a"),
  };
  await using screen = await render(
    <RegistryContext value={registry}>
      <ChatMarkdown text={referenceMention} cwd="/tmp/project" threadRef={threadRef} customBlocks />
    </RegistryContext>,
  );
  expect(referenceLookup).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "E-406", exact: true }));
  await expect.element(page.getByRole("status")).toHaveTextContent("Loading reference…");
  expect(referenceLookup).toHaveBeenCalledWith({
    environmentId: threadRef.environmentId,
    input: { threadId: threadRef.threadId, id: "linear/E-406" },
  });
  await act(() => registry.set(result, AsyncResult.fail(new Error("Disconnected"))));
  await expect
    .element(
      page
        .getByRole("alert")
        .getByText("Unable to load this reference: Disconnected", { exact: true }),
    )
    .toBeVisible();
  await expect.element(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await userEvent.click(page.getByRole("button", { name: "Retry" }));
  await act(() =>
    registry.set(
      result,
      AsyncResult.success({
        reference: { id: "linear/E-406", title: "Saved answer", body: "Old **saved** definition" },
      }),
    ),
  );
  await expect.element(page.getByRole("dialog").getByText("Saved answer")).toBeVisible();
  await screen.rerender(
    <RegistryContext value={registry}>
      <ChatMarkdown
        text={referenceMention + "\n\n" + referenceDeclaration("Local wins")}
        cwd="/tmp/project"
        threadRef={threadRef}
        customBlocks
      />
    </RegistryContext>,
  );
  await expect.element(page.getByRole("dialog").getByText("Local wins")).toBeVisible();
});

it("degrades an authoritative missing saved reference to its readable label", async () => {
  setup();
  referenceLookup.mockReturnValue(Atom.make(AsyncResult.success({ reference: null })));
  const threadRef = {
    environmentId: EnvironmentId.make("env-a"),
    threadId: ThreadId.make("thread-a"),
  };
  await using screen = await renderText(referenceMention, { threadRef, customBlocks: true });
  await userEvent.click(screen.getByRole("button", { name: "E-406", exact: true }));
  await expect
    .element(screen.getByRole("button", { name: "E-406", exact: true }))
    .not.toBeInTheDocument();
  await expect.element(screen.getByText("E-406", { exact: true })).toBeVisible();
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  await screen.rerender(
    <ChatMarkdown
      text={referenceMention + "\n\n" + referenceDeclaration("New local declaration")}
      cwd="/tmp/project"
      threadRef={threadRef}
      customBlocks
    />,
  );
  await expect.element(screen.getByRole("button", { name: "E-406", exact: true })).toBeVisible();
  await screen.rerender(
    <ChatMarkdown text={referenceMention} cwd="/tmp/project" threadRef={threadRef} customBlocks />,
  );
  referenceLookup.mockReturnValue(
    Atom.make(
      AsyncResult.success({
        reference: {
          id: "linear/E-406",
          title: "Fresh saved declaration",
          body: "Current saved body",
        },
      }),
    ),
  );
  await userEvent.click(screen.getByRole("button", { name: "E-406", exact: true }));
  await expect.element(page.getByRole("dialog").getByText("Fresh saved declaration")).toBeVisible();
});

it("discards pending saved results across environment and conversation switches", async () => {
  setup();
  const registry = AtomRegistry.make();
  using _registry = { [Symbol.dispose]: () => registry.dispose() };
  const first = Atom.make<
    AsyncResult.AsyncResult<OrchestrationV2GetMarkdownReferenceResult, Error>
  >(AsyncResult.initial(true));
  const second = Atom.make<
    AsyncResult.AsyncResult<OrchestrationV2GetMarkdownReferenceResult, Error>
  >(AsyncResult.initial(true));
  const firstRef = {
    environmentId: EnvironmentId.make("env-a"),
    threadId: ThreadId.make("thread-a"),
  };
  const secondRef = {
    environmentId: EnvironmentId.make("env-b"),
    threadId: ThreadId.make("thread-b"),
  };
  referenceLookup.mockImplementation(({ environmentId }) =>
    environmentId === firstRef.environmentId ? first : second,
  );
  await using screen = await render(
    <RegistryContext value={registry}>
      <ChatMarkdown text={referenceMention} cwd="/tmp/project" threadRef={firstRef} customBlocks />
    </RegistryContext>,
  );
  await userEvent.click(screen.getByRole("button", { name: "E-406", exact: true }));
  await expect.element(page.getByRole("status")).toBeVisible();
  await screen.rerender(
    <RegistryContext value={registry}>
      <ChatMarkdown text={referenceMention} cwd="/tmp/project" threadRef={secondRef} customBlocks />
    </RegistryContext>,
  );
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  await act(() =>
    registry.set(
      first,
      AsyncResult.success({
        reference: { id: "linear/E-406", title: "Stale first scope", body: "Must not leak" },
      }),
    ),
  );
  await userEvent.click(screen.getByRole("button", { name: "E-406", exact: true }));
  await expect.element(page.getByRole("status")).toBeVisible();
  await expect.element(page.getByText("Stale first scope")).not.toBeInTheDocument();
  await act(() =>
    registry.set(
      second,
      AsyncResult.success({
        reference: { id: "linear/E-406", title: "Current scope", body: "Correct body" },
      }),
    ),
  );
  await expect.element(page.getByRole("dialog").getByText("Current scope")).toBeVisible();
});

it("dismisses through the house touch backdrop without activating a control underneath", async () => {
  setup();
  const activate = vi.fn();
  await using screen = await render(
    <>
      <ChatMarkdown
        text={referenceMention + "\n\n" + referenceDeclaration()}
        cwd="/tmp/project"
        customBlocks
      />
      <button onClick={activate}>Underlying action</button>
    </>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Underlying action" }));
  activate.mockClear();
  const trigger = screen.getByRole("button", { name: "E-406", exact: true }).element();
  await act(() => {
    trigger.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", button: 0 }),
    );
    trigger.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", button: 0 }),
    );
    if (trigger instanceof HTMLElement) trigger.focus();
  });
  expect(trigger.matches(":focus-visible")).toBe(false);
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  await act(() => {
    if (trigger instanceof HTMLElement) trigger.click();
  });
  await expect.element(page.getByRole("dialog")).toBeVisible();
  const backdrop = document.querySelector('[data-slot="popover-backdrop"]');
  expect(backdrop).not.toBeNull();
  backdrop?.setAttribute("data-testid", "reference-touch-backdrop");
  // Make the coarse-pointer backdrop actionable in this desktop test browser.
  if (backdrop instanceof HTMLElement) backdrop.style.display = "block";
  await userEvent.click(page.getByTestId("reference-touch-backdrop"));
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  expect(activate).not.toHaveBeenCalled();
});

it("copies authored reference links without adding portaled briefing content", async () => {
  setup();
  await using screen = await renderText(referenceMention + "\n\n" + referenceDeclaration(), {
    customBlocks: true,
  });
  await userEvent.click(screen.getByRole("button", { name: "E-406", exact: true }));
  await expect.element(page.getByRole("dialog")).toBeVisible();
  const paragraph = screen.container.querySelector("p");
  expect(paragraph).not.toBeNull();
  const selection = window.getSelection();
  using _selection = { [Symbol.dispose]: () => selection?.removeAllRanges() };
  const range = document.createRange();
  if (paragraph) range.selectNodeContents(paragraph);
  selection?.removeAllRanges();
  selection?.addRange(range);
  expect(selection && chatMarkdownClipboardPayload(selection)?.text).toBe(referenceMention);
});

it("renders recap details, briefings and scoped work links independently", async () => {
  setup();
  const recap = {
    lead: "Nothing needs you right now.",
    items: [
      {
        label: "E-406",
        reference: "linear/E-406",
        status: "running",
        summary: "CI running again",
        details: "Rich **details** and [context](ref:linear/E-406).",
        work: { kind: "thread", url: "t3-thread://v2/remote-env/work%3Atask" },
      },
      {
        label: "Worker",
        status: "building",
        summary: "Building history",
        details: "Worker details",
        work: { kind: "subagent", url: "t3-thread://v2/other-env/child" },
      },
      { label: "Local", status: "running", summary: "No linked work", details: "Local details" },
    ],
    next: [{ label: "E-408" }],
  };
  const fence = "```recap\n" + JSON.stringify(recap) + "\n```";
  await using screen = await renderText(fence + "\n\n" + referenceDeclaration(), {
    customBlocks: true,
  });
  const summary = screen.getByText("CI running again", { exact: true });
  await expect.element(summary).toBeVisible();
  await expect.element(summary).toHaveAccessibleName("Running: CI running again");
  await expect
    .element(screen.getByText("Building history", { exact: true }))
    .toHaveAccessibleName("Building: Building history");
  await expect.element(screen.getByText("details", { exact: true })).not.toBeVisible();
  const details = screen.container.querySelector("details");
  expect(details?.open).toBe(false);
  const work = screen.getByRole("link", { name: "Open E-406 thread" });
  await expect.element(work).toHaveAttribute("href", "/remote-env/work%253Atask");
  await expect
    .element(screen.getByRole("link", { name: "Open Worker subagent" }))
    .toHaveAttribute("href", "/other-env/child");
  expect(screen.container.querySelectorAll(".markdown-recap-work")).toHaveLength(2);
  expect(screen.container.querySelector("summary a, summary button")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "E-406", exact: true }));
  await expect.element(page.getByText("Brookhaven Orthopedics", { exact: true })).toBeVisible();
  expect(details?.open).toBe(false);
  await userEvent.keyboard("{Escape}");
  summary.element().focus();
  await userEvent.keyboard("{Enter}");
  await expect.element(screen.getByText("details", { exact: true })).toBeVisible();
  expect(screen.container.querySelector("details strong")?.textContent).toBe("details");
  await userEvent.click(screen.getByRole("button", { name: "context", exact: true }));
  await expect.element(page.getByText("Brookhaven Orthopedics", { exact: true })).toBeVisible();
  await userEvent.keyboard("{Escape}");
  summary.element().focus();
  await userEvent.keyboard(" ");
  expect(details?.open).toBe(false);
  for (const [text, customBlocks] of [
    [fence, false],
    [fence.slice(0, -3), true],
    [fence.replace("recap\n", "recap extra\n"), true],
    ["```recap\n{}\n```", true],
  ] as const) {
    await screen.rerender(<ChatMarkdown cwd={undefined} text={text} customBlocks={customBlocks} />);
    expect(screen.container.querySelector(".markdown-recap")).toBeNull();
    expect(screen.container.querySelector("pre")).not.toBeNull();
  }
});
