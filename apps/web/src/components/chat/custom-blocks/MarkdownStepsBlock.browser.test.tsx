import { expect, it } from "vite-plus/test";
import { render } from "../../../../test/render";
import { MarkdownStepsBlock } from "./MarkdownStepsBlock";
import { parseMarkdownSteps } from "./markdownSteps";
import "../../../index.css";

const plan = {
  title: "Execution plan",
  items: [
    { label: "Foundation", owner: "agent", state: "planned" },
    {
      label: "Parallel area migrations",
      owner: "agent",
      state: "planned",
      detail: "Each area is **independent**",
      parallel: [
        { label: "Backoffice", owner: "agent", state: "planned" },
        { label: "Law firm" },
        { label: "Portal" },
      ],
    },
    { label: "Validation", owner: "user", state: "pending" },
  ],
};

const renderSteps = (value: object) =>
  render(
    <MarkdownStepsBlock
      steps={parseMarkdownSteps(JSON.stringify(value))!}
      renderMarkdown={(text) => <p>{text}</p>}
    />,
  );

it("renders an ordered list with owners, state labels and the parallel group", async () => {
  await using screen = await renderSteps(plan);
  expect(screen.container.querySelector("ol")).not.toBeNull();
  expect(screen.container.querySelectorAll("li")).toHaveLength(3);
  await expect.element(screen.getByText("Foundation")).toBeVisible();
  await expect.element(screen.getByText("In parallel")).toBeVisible();
  await expect.element(screen.getByText("Backoffice")).toBeVisible();
  await expect.element(screen.getByText("You")).toBeVisible();
  await expect.element(screen.getByText("Pending")).toBeVisible();
  expect(screen.container.querySelector("input")).toBeNull();
});

it("keeps detail closed in a native details element and renders a bullet list when unordered", async () => {
  await using screen = await renderSteps({ ...plan, ordered: false });
  expect(screen.container.querySelector("ul")).not.toBeNull();
  const details = screen.container.querySelector("details")!;
  expect(details.open).toBe(false);
  await expect.element(screen.getByText("Each area is **independent**")).not.toBeVisible();
});

it("shows a single marker in the unordered variant inside chat markdown", async () => {
  await using screen = await render(
    <div className="chat-markdown">
      <MarkdownStepsBlock
        steps={parseMarkdownSteps(JSON.stringify({ ordered: false, items: [{ label: "One" }] }))!}
        renderMarkdown={(body) => <p>{body}</p>}
      />
    </div>,
  );
  const item = screen.container.querySelector("li")!;
  expect(getComputedStyle(item).listStyleType).toBe("none");
  expect(getComputedStyle(item, "::before").content).toContain("•");
});
