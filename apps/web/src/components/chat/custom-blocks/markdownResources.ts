import { PullRequestChecksState, PullRequestReviewDecision } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const text = (max: number) => Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(max));
const id = (max: number) =>
  Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]+$/), Schema.isMaxLength(max));
const count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const nonEmpty = Schema.makeFilter((value: object) => Object.keys(value).length > 0);
const isHttpUrl = (value: string) => {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};
const MarkdownResources = Schema.Struct({
  title: text(256),
  scope: text(512),
  asOf: Schema.optionalKey(
    Schema.String.check(
      Schema.makeFilter(
        (value) => /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value)),
      ),
    ),
  ),
  coverage: Schema.Literals(["all", "subset", "unknown"]),
  groups: Schema.NonEmptyArray(
    Schema.Struct({
      id: id(64),
      label: text(128),
      collapsed: Schema.optionalKey(Schema.Boolean),
    }),
  ).check(Schema.isMaxLength(10)),
  items: Schema.Array(
    Schema.Struct({
      group: id(64),
      id: Schema.optionalKey(text(64)),
      title: text(512),
      url: Schema.optionalKey(Schema.String.check(Schema.makeFilter(isHttpUrl))),
      state: Schema.optionalKey(text(64)),
      summary: Schema.optionalKey(text(1024)),
      meta: Schema.optionalKey(
        Schema.Array(Schema.Struct({ label: text(64), value: text(256) })).check(
          Schema.isMaxLength(6),
        ),
      ),
      diff: Schema.optionalKey(
        Schema.Struct({
          additions: Schema.optionalKey(count),
          deletions: Schema.optionalKey(count),
          files: Schema.optionalKey(count),
        }).check(nonEmpty),
      ),
      checks: Schema.optionalKey(PullRequestChecksState),
      review: Schema.optionalKey(PullRequestReviewDecision),
      comments: Schema.optionalKey(
        Schema.Struct({ human: Schema.optionalKey(count), agent: Schema.optionalKey(count) }).check(
          nonEmpty,
        ),
      ),
      next: Schema.optionalKey(text(256)),
      stale: Schema.optionalKey(Schema.Boolean),
    }),
  ).check(Schema.isMaxLength(50)),
  correction: Schema.optionalKey(text(1024)),
  caveat: Schema.optionalKey(text(1024)),
});
const decode = Schema.decodeUnknownSync(MarkdownResources, { onExcessProperty: "error" });

export function parseMarkdownResources(source: string) {
  if (source.length > 65536) return null;
  try {
    const resources = decode(JSON.parse(source));
    const ids = new Set(resources.groups.map((group) => group.id));
    if (ids.size !== resources.groups.length) return null;
    if (resources.items.some((item) => !ids.has(item.group))) return null;
    return resources;
  } catch {
    return null;
  }
}
export type MarkdownResourcesDefinition = NonNullable<ReturnType<typeof parseMarkdownResources>>;
