import { parseMarkdownReferenceHref } from "@t3tools/shared/markdownReferences";
import { parseThreadLinkHref } from "@t3tools/shared/threadLinks";
import * as Schema from "effect/Schema";

const text = (max: number) => Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(max));
const label = {
  label: text(256),
  reference: Schema.optionalKey(
    Schema.String.check(
      Schema.makeFilter((value) => parseMarkdownReferenceHref(`ref:${value}`) !== null),
    ),
  ),
};
const MarkdownRecap = Schema.Struct({
  lead: text(2048),
  items: Schema.NonEmptyArray(
    Schema.Struct({
      ...label,
      status: Schema.Literals(["running", "building"]),
      summary: text(1024),
      details: text(32768),
      work: Schema.optionalKey(
        Schema.Struct({
          kind: Schema.Literals(["thread", "subagent"]),
          url: text(4096),
        }),
      ),
    }),
  ).check(Schema.isMaxLength(32)),
  next: Schema.optionalKey(
    Schema.NonEmptyArray(Schema.Struct(label)).check(Schema.isMaxLength(32)),
  ),
});
const decode = Schema.decodeUnknownSync(MarkdownRecap, { onExcessProperty: "error" });

export function parseMarkdownRecap(source: string) {
  if (source.length > 65536) return null;
  try {
    const recap = decode(JSON.parse(source));
    const items = recap.items.map((item) => {
      if (!item.work) return { ...item, work: undefined };
      const ref = parseThreadLinkHref(item.work.url);
      if (!ref || ref.environmentId === null) throw new Error("Work link must name an environment");
      return {
        ...item,
        work: { ...item.work, ref: { environmentId: ref.environmentId, threadId: ref.threadId } },
      };
    });
    return { ...recap, items };
  } catch {
    return null;
  }
}
export type MarkdownRecapDefinition = NonNullable<ReturnType<typeof parseMarkdownRecap>>;
