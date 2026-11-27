import { expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "../../../../test/render";
import ChatMarkdown from "../../ChatMarkdown";
import { MarkdownFactsBlock } from "./MarkdownFactsBlock";
import { parseMarkdownFacts } from "./markdownFacts";
import "../../../index.css";

const facts = {
  title: "Still open",
  items: [
    {
      title: "Context budget failure",
      brief: "The instructions grew past the budget.",
      details: "The limit lives in `agentContextBudget.json`.\n\n- **Fix:** shorten them",
      tone: "problem",
      icon: "circle-x",
    },
    {
      title: "No CI pass",
      brief: "Lint never ran.",
      details: "Only local checks back the code.",
      tone: "warn",
      icon: "triangle-alert",
    },
    { title: "Local review rounds", brief: "No record of `/ce-code-review`.", tone: "info" },
    { title: "Tooling", brief: "Five pieces depend on the format." },
  ],
};

const renderFacts = (value: object) =>
  render(
    <MarkdownFactsBlock
      facts={parseMarkdownFacts(JSON.stringify(value))!}
      renderMarkdown={(body) => <p>{body}</p>}
    />,
  );

it("renders the title, tone counts and every title with its brief", async () => {
  await using screen = await renderFacts(facts);
  await expect.element(screen.getByText("Still open")).toBeVisible();
  await expect.element(screen.getByText("1 problem")).toBeVisible();
  await expect.element(screen.getByText("1 warning")).toBeVisible();
  await expect.element(screen.getByText("1 info")).toBeVisible();
  expect(screen.container.querySelectorAll("[data-slot=badge]")).toHaveLength(3);
  for (const item of facts.items) {
    await expect.element(screen.getByText(item.title)).toBeVisible();
    await expect.element(screen.getByText(item.brief)).toBeVisible();
  }
  // Toned tiles name their tone; an untoned item without an icon falls back to a dot.
  expect(screen.getByRole("img", { name: "Problem" }).elements()).toHaveLength(1);
  expect(screen.container.querySelectorAll(".markdown-facts-dot")).toHaveLength(2);
  // Only items with details are disclosures, and only the first starts open.
  const details = [...screen.container.querySelectorAll("details")];
  expect(details.map((element) => element.open)).toEqual([true, false]);
});

it("hides the counts when no item has a tone", async () => {
  await using screen = await renderFacts({
    items: [
      { title: "A", brief: "a", icon: "package" },
      { title: "B", brief: "b" },
    ],
  });
  expect(screen.container.querySelector("[data-slot=badge]")).toBeNull();
  expect(screen.container.querySelector(".markdown-facts-head")).toBeNull();
});

it("opens and closes an item's details from the keyboard", async () => {
  await using screen = await renderFacts(facts);
  const summary = screen.container.querySelectorAll<HTMLElement>("details > summary")[1]!;
  const details = summary.parentElement as HTMLDetailsElement;
  expect(summary.textContent).toContain("No CI pass");
  await expect.element(screen.getByText("Only local checks back the code.")).not.toBeVisible();
  summary.focus();
  await userEvent.keyboard("{Enter}");
  await expect.poll(() => details.open).toBe(true);
  await expect.element(screen.getByText("Only local checks back the code.")).toBeVisible();
  await userEvent.keyboard(" ");
  await expect.poll(() => details.open).toBe(false);
});

it("renders Markdown in details and inline Markdown in briefs from a chat fence", async () => {
  await using screen = await render(
    <ChatMarkdown cwd="/w" text={"```facts\n" + JSON.stringify(facts) + "\n```"} customBlocks />,
  );
  await expect.element(screen.getByText("agentContextBudget.json")).toBeVisible();
  const panel = screen.container.querySelector(".markdown-facts-details")!;
  expect(panel.querySelector("code")?.textContent).toBe("agentContextBudget.json");
  expect(panel.querySelector("ul li strong")?.textContent).toBe("Fix:");
  const card = screen.container.querySelector(".markdown-facts")!;
  expect(
    [...card.querySelectorAll(".markdown-facts-brief code")].map((c) => c.textContent),
  ).toEqual(["/ce-code-review"]);
  expect(card.textContent).not.toContain("`");
  expect(screen.getByText("Tooling").element().querySelector(".chat-markdown")).toBeNull();
});
