import { expect, it } from "vite-plus/test";
import { render } from "../../../../test/render";
import ChatMarkdown from "../../ChatMarkdown";
import { MarkdownRisksBlock } from "./MarkdownRisksBlock";
import { parseMarkdownRisks } from "./markdownRisks";
import "../../../index.css";

it("renders risks with text labels for evidence and severity", async () => {
  const risks = parseMarkdownRisks(
    JSON.stringify({
      title: "Risks to validate",
      items: [
        {
          title: "Dates",
          impact: "Different calendar library",
          mitigation: "Manual QA",
          evidence: "unverified",
          severity: "high",
        },
        { title: "Tailwind / Vite Ruby", impact: "Scanning untested", evidence: "unverified" },
        { title: "Base UI", impact: "Portal bubbling issues", evidence: "reported" },
      ],
    }),
  )!;
  await using screen = await render(
    <MarkdownRisksBlock risks={risks} renderMarkdown={(body) => body} />,
  );
  await expect.element(screen.getByText("Risks to validate")).toBeVisible();
  await expect.element(screen.getByText("Dates")).toBeVisible();
  await expect.element(screen.getByText("High risk")).toBeVisible();
  await expect.element(screen.getByText("Mitigation: Manual QA")).toBeVisible();
  await expect.element(screen.getByText("Reported")).toBeVisible();
  expect(screen.getByText("High risk").elements()).toHaveLength(1);
  expect(screen.getByText("Unverified").elements()).toHaveLength(2);
  // Evidence is quiet text beside the severity, not a badge competing with the title.
  expect(screen.container.querySelector("[data-slot=badge]")).toBeNull();
});

it("scales with the interface font size instead of a fixed pixel size", async () => {
  const risks = parseMarkdownRisks(
    JSON.stringify({ items: [{ title: "A", impact: "x", evidence: "reported" }] }),
  )!;
  const root = document.documentElement;
  const previous = root.style.fontSize;
  root.style.fontSize = "20px";
  try {
    await using screen = await render(
      <MarkdownRisksBlock risks={risks} renderMarkdown={(body) => body} />,
    );
    const card = screen.container.querySelector<HTMLElement>(".markdown-card")!;
    expect(getComputedStyle(card).fontSize).toBe("17.5px");
  } finally {
    root.style.fontSize = previous;
  }
});

it("shows no list bullets or indent inside chat markdown", async () => {
  const risks = parseMarkdownRisks(
    JSON.stringify({ items: [{ title: "A", impact: "x", evidence: "reported" }] }),
  )!;
  await using screen = await render(
    <div className="chat-markdown">
      <MarkdownRisksBlock risks={risks} renderMarkdown={(body) => body} />
    </div>,
  );
  const list = screen.container.querySelector("ul")!;
  expect(getComputedStyle(list).listStyleType).toBe("none");
  expect(getComputedStyle(list).paddingInlineStart).toBe("0px");
});

it("renders inline Markdown in text fields and leaves plain fields as text", async () => {
  const risks = {
    items: [
      {
        title: "Plain title",
        impact: "Runs `vp i` on **every** sync",
        mitigation: "Copy `statev2.sqlite` first",
        evidence: "verified",
      },
    ],
  };
  await using screen = await render(
    <ChatMarkdown cwd="/w" text={"```risks\n" + JSON.stringify(risks) + "\n```"} customBlocks />,
  );
  await expect.element(screen.getByText("vp i")).toBeVisible();
  const card = screen.container.querySelector(".markdown-card")!;
  expect([...card.querySelectorAll("code")].map((code) => code.textContent)).toEqual([
    "vp i",
    "statev2.sqlite",
  ]);
  expect(card.querySelector("strong")?.textContent).toBe("every");
  expect(card.textContent).not.toContain("`");
  expect(screen.getByText("Plain title").element().querySelector(".chat-markdown")).toBeNull();
});
