import { describe, expect, it } from "vite-plus/test";
import { parseMarkdownResources } from "./markdownResources";

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
const parse = (value: object) => parseMarkdownResources(JSON.stringify(value));
const withItem = (extra: object) => ({
  ...fixture,
  items: [{ ...fixture.items[0], ...extra }],
});

describe("Markdown resources", () => {
  it("accepts the pull-request overview fixture", () => {
    expect(parse(fixture)?.items).toHaveLength(4);
  });

  it("rejects non-http urls but allows a missing url", () => {
    expect(parse(withItem({ url: "javascript:alert(1)" }))).toBeNull();
    expect(parse(withItem({ url: "data:text/html,hi" }))).toBeNull();
    expect(parse(withItem({ url: "not a url" }))).toBeNull();
    expect(parse(withItem({ url: undefined }))?.items[0]?.url).toBeUndefined();
  });

  it("validates diffs without defaulting missing parts", () => {
    expect(parse(withItem({ diff: { additions: 3 } }))?.items[0]?.diff).toEqual({ additions: 3 });
    expect(parse(withItem({ diff: {} }))).toBeNull();
    expect(parse(withItem({ diff: { additions: -1 } }))).toBeNull();
    expect(parse(withItem({ diff: { files: 1.5 } }))).toBeNull();
  });

  it("accepts pull-request signals and rejects unknown values", () => {
    const signals = { checks: "failing", review: "changes-requested", comments: { human: 2 } };
    expect(parse(withItem(signals))?.items[0]).toMatchObject(signals);
    const invalid = [
      { checks: "green" },
      { review: "changes_requested" },
      { comments: {} },
      { comments: { human: -1 } },
      { comments: { agent: 1.5 } },
      { comments: { bots: 1 } },
    ];
    for (const value of invalid) expect(parse(withItem(value))).toBeNull();
  });

  it("rejects invalid structure", () => {
    const invalid = [
      { ...fixture, extra: true },
      { ...fixture, coverage: "some" },
      { ...fixture, asOf: "yesterday" },
      { ...fixture, groups: [] },
      { ...fixture, groups: [fixture.groups[0], fixture.groups[0]] },
      withItem({ group: "missing" }),
      withItem({ counts: 2 }),
      withItem({ meta: Array.from({ length: 7 }, () => ({ label: "a", value: "b" })) }),
      { ...fixture, title: " " },
      { ...fixture, items: Array.from({ length: 51 }, () => fixture.items[0]) },
    ];
    for (const value of invalid) expect(parse(value)).toBeNull();
    expect(parseMarkdownResources("{")).toBeNull();
    expect(parseMarkdownResources(JSON.stringify(fixture) + " ".repeat(65536))).toBeNull();
    expect(parse({ ...fixture, items: [] })?.items).toEqual([]);
  });
});
