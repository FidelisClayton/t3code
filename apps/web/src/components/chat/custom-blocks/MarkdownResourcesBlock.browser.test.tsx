import { expect, it } from "vite-plus/test";
import { render } from "../../../../test/render";
import { MarkdownResourcesBlock } from "./MarkdownResourcesBlock";
import { parseMarkdownResources } from "./markdownResources";
import "../../../index.css";

const url = (n: number) => `https://github.com/casedotco/case_portal/pull/${n}`;
const fixture = {
  title: "Your pull requests",
  scope: "casedotco/case_portal · 4 tracked",
  asOf: "2026-11-25",
  coverage: "subset",
  groups: [
    { id: "open", label: "Open" },
    { id: "merged", label: "Merged", collapsed: true },
  ],
  items: [
    {
      group: "open",
      id: "#1858",
      title: "Demo-video narration and demo-director skill",
      url: url(1858),
    },
    { group: "open", id: "#1654", title: "Settlement work queue", url: url(1654) },
    { group: "merged", id: "#1903", title: "Work for today in the sidebar", url: url(1903) },
    { group: "merged", id: "#1904", title: "Fixes from the #1853 review", url: url(1904) },
  ],
  correction: "case-co → casedotco in previous PR URLs",
  caveat: "Private repo; a 404 usually means missing access",
};
const direct = (value: object) =>
  render(
    <MarkdownResourcesBlock
      resources={parseMarkdownResources(JSON.stringify(value))!}
      renderMarkdown={(body, _references, _choices, inline) =>
        inline ? <span>{body}</span> : <p>{body}</p>
      }
    />,
  );

it("renders the fixture with one header row, per-group counts and a closed merged group", async () => {
  await using screen = await direct(fixture);
  await expect.element(screen.getByText("Your pull requests", { exact: false })).toBeVisible();
  await expect
    .element(screen.getByText("Corrected: case-co → casedotco in previous PR URLs"))
    .toBeVisible();
  await expect.element(screen.getByText("Snapshot: 2026-11-25", { exact: false })).toBeVisible();
  await expect.element(screen.getByText("Subset", { exact: false })).toBeVisible();
  expect(screen.container.textContent).not.toContain("Open (2) · Merged (2)");
  await expect.element(screen.getByText("Open (2)")).toBeVisible();
  const merged = screen.container.querySelector("details");
  expect(merged?.open).toBe(false);
  expect(merged?.textContent).toContain("Merged (2)");
  expect(screen.container.querySelector(".markdown-resources-bar")).toBeNull();
});

it("shows the distribution bar only when coverage is all", async () => {
  await using screen = await direct({ ...fixture, coverage: "all" });
  expect(screen.container.querySelector(".markdown-resources-bar")).not.toBeNull();
});

it("renders titles as escaped markdown links and leaves url-less titles as text", async () => {
  await using screen = await direct({
    ...fixture,
    items: [
      { ...fixture.items[0], title: "Fix [brackets] *now*" },
      { group: "open", title: "No link here" },
    ],
  });
  await expect
    .element(
      screen.getByText(
        "[Fix \\[brackets\\] \\*now\\*](https://github.com/casedotco/case_portal/pull/1858)",
      ),
    )
    .toBeVisible();
  await expect.element(screen.getByText("No link here")).toBeVisible();
});

it("omits missing diff parts instead of showing zero", async () => {
  await using screen = await direct({
    ...fixture,
    items: [{ group: "open", title: "A", diff: { additions: 5, files: 1 } }],
  });
  const diff = screen.container.querySelector("[aria-label]");
  expect(diff?.getAttribute("aria-label")).toBe("5 additions, 1 file");
  expect(diff?.textContent).toBe("+5 · 1 file");
});

it("shows pull-request signals as labelled icons, coloring only failing checks", async () => {
  await using screen = await direct({
    ...fixture,
    items: [
      {
        group: "open",
        title: "A",
        checks: "failing",
        review: "approved",
        comments: { human: 2, agent: 0 },
      },
      { group: "open", title: "B", checks: "passing" },
    ],
  });
  const failing = screen.getByRole("img", { name: "Some checks were not successful" });
  await expect.element(failing).toBeVisible();
  expect(failing.element().parentElement?.dataset.tone).toBe("danger");
  const passing = screen.getByRole("img", { name: "All checks have passed" });
  expect(passing.element().parentElement?.dataset.tone).toBeUndefined();
  await expect.element(screen.getByText("Approved")).toBeInTheDocument();
  await expect
    .element(screen.getByRole("img", { name: "2 human comments" }))
    .toHaveTextContent("2");
  expect(screen.container.textContent).not.toContain("agent comment");
});

it("hides an item state that repeats its group label", async () => {
  await using screen = await direct({
    ...fixture,
    items: [
      { group: "open", id: "#1", title: "A", state: " open " },
      { group: "open", id: "#2", title: "B", state: "draft" },
    ],
  });
  const text = screen.container.textContent ?? "";
  expect(text).toContain("draft");
  expect(text).not.toContain("open ");
  expect(screen.container.querySelectorAll("[data-slot=badge]")).toHaveLength(1);
});

it("draws a custom chevron instead of the native marker on collapsed groups", async () => {
  await using screen = await direct(fixture);
  const summary = screen.container.querySelector("summary")!;
  expect(getComputedStyle(summary).listStyleType).toBe("none");
  expect(getComputedStyle(summary, "::after").content).not.toBe("none");
});

it("keeps a crafted url inside one link destination", async () => {
  const evil = "https://example.com/a b)[x](https://evil.example/)";
  await using screen = await direct({
    ...fixture,
    items: [{ ...fixture.items[0], url: evil }],
  });
  const text = screen.container.querySelector(".markdown-resources-main p")?.textContent ?? "";
  expect(text).toBe(
    "[Demo-video narration and demo-director skill](https://example.com/a%20b%29[x]%28https://evil.example/%29)",
  );
});

it("renders a flat list with no group header", async () => {
  const flat = parseMarkdownResources(
    '{"title":"Adaptive blocks PRs","scope":"FidelisClayton/t3code","asOf":"2026-11-27","coverage":"all","items":[{"title":"feat(web): adaptive response blocks for agent replies (#1)","url":"https://github.com/FidelisClayton/t3code/pull/1","state":"merged","review":"review-required","checks":"failing","meta":[{"label":"Merged","value":"2026-11-26 17:02 UTC"}],"summary":"No reviews."}]}',
  );
  if (!flat) throw new Error("flat resources should parse");
  await using screen = await render(
    <MarkdownResourcesBlock resources={flat} renderMarkdown={(text) => text} />,
  );
  await expect.element(screen.getByText("Adaptive blocks PRs", { exact: false })).toBeVisible();
  await expect.element(screen.getByText("No reviews.")).toBeVisible();
  expect(screen.container.querySelector(".markdown-resources-group")).toBeNull();
});

it("links a local file item as a Markdown file link", async () => {
  await using screen = await direct({
    title: "Docs",
    scope: "docs/internals",
    coverage: "all",
    items: [{ title: "11_mobile-layout.md", url: "/home/clayton/docs/11_mobile-layout.md:12" }],
  });
  expect(screen.container.querySelector(".markdown-resources-main p")?.textContent).toBe(
    "[11\\_mobile-layout.md](/home/clayton/docs/11_mobile-layout.md:12)",
  );
});
