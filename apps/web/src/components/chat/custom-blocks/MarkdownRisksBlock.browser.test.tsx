import { expect, it } from "vite-plus/test";
import { render } from "../../../../test/render";
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
  await using screen = await render(<MarkdownRisksBlock risks={risks} />);
  await expect.element(screen.getByText("Risks to validate")).toBeVisible();
  await expect.element(screen.getByText("Dates")).toBeVisible();
  await expect.element(screen.getByText("High risk")).toBeVisible();
  await expect.element(screen.getByText("Mitigation: Manual QA")).toBeVisible();
  await expect.element(screen.getByText("Reported")).toBeVisible();
  expect(screen.getByText("High risk").elements()).toHaveLength(1);
  expect(screen.getByText("Unverified").elements()).toHaveLength(2);
});

it("shows no list bullets or indent inside chat markdown", async () => {
  const risks = parseMarkdownRisks(
    JSON.stringify({ items: [{ title: "A", impact: "x", evidence: "reported" }] }),
  )!;
  await using screen = await render(
    <div className="chat-markdown">
      <MarkdownRisksBlock risks={risks} />
    </div>,
  );
  const list = screen.container.querySelector("ul")!;
  expect(getComputedStyle(list).listStyleType).toBe("none");
  expect(getComputedStyle(list).paddingInlineStart).toBe("0px");
});
