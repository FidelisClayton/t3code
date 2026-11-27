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

const flat =
  '{"title":"Adaptive blocks PRs","scope":"FidelisClayton/t3code","asOf":"2026-11-27","coverage":"all","items":[{"title":"feat(web): adaptive response blocks for agent replies (#1)","url":"https://github.com/FidelisClayton/t3code/pull/1","state":"merged","review":"review-required","checks":"failing","meta":[{"label":"Merged","value":"2026-11-26 17:02 UTC"}],"summary":"No reviews."}]}';

describe("Markdown resources", () => {
  it("parses a flat list without groups", () => {
    expect(parseMarkdownResources(flat)?.items).toHaveLength(1);
  });

  it("allows an ungrouped item alongside groups but rejects an unknown group", () => {
    const { group: _group, ...ungrouped } = fixture.items[0]!;
    expect(parse({ ...fixture, items: [ungrouped, fixture.items[2]] })?.items).toHaveLength(2);
    expect(parse({ ...fixture, items: [{ ...ungrouped, group: "nope" }] })).toBeNull();
  });

  it("accepts the pull-request overview fixture", () => {
    expect(parse(fixture)?.items).toHaveLength(4);
  });

  it("accepts the local-file docs list from a real reply", () => {
    const reply =
      '{"title":"Ler antes de mexer no mobile layout","scope":"docs/internals","coverage":"all","items":[{"title":"11_mobile-layout.md","url":"/home/clayton/.t3/worktrees/t3code/t3-prompt-eval/docs/internals/11_mobile-layout.md","summary":"O doc principal."},{"title":"12_mobile-navigation.md","url":"/home/clayton/x/12_mobile-navigation.md","summary":"Navegação."}]}';
    expect(parseMarkdownResources(reply)?.items).toHaveLength(2);
  });

  it("accepts absolute paths with a line suffix but not relative or protocol-relative ones", () => {
    for (const ok of ["/a/b.ts", "/a/b.ts:12", "/a/b.ts:12:3"]) {
      expect(parse(withItem({ url: ok }))).not.toBeNull();
    }
    for (const bad of ["a/b.ts", "./b.ts", "//evil.example/x", "/a b", "file:///a/b", "/"]) {
      expect(parse(withItem({ url: bad }))).toBeNull();
    }
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
