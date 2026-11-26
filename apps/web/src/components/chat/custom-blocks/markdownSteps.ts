import * as Schema from "effect/Schema";

const text = (max: number) => Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(max));
const owner = Schema.optionalKey(Schema.Literals(["user", "agent"]));
const state = Schema.optionalKey(
  Schema.Literals(["planned", "pending", "done", "blocked", "unverified"]),
);
const MarkdownSteps = Schema.Struct({
  title: Schema.optionalKey(text(256)),
  ordered: Schema.optionalKey(Schema.Boolean),
  items: Schema.NonEmptyArray(
    Schema.Struct({
      label: text(512),
      owner,
      state,
      detail: Schema.optionalKey(text(8192)),
      parallel: Schema.optionalKey(
        Schema.NonEmptyArray(Schema.Struct({ label: text(256), owner, state })).check(
          Schema.isMaxLength(12),
        ),
      ),
    }),
  ).check(Schema.isMaxLength(30)),
});
const decode = Schema.decodeUnknownSync(MarkdownSteps, { onExcessProperty: "error" });

export function parseMarkdownSteps(source: string) {
  if (source.length > 65536) return null;
  try {
    return decode(JSON.parse(source));
  } catch {
    return null;
  }
}
export type MarkdownStepsDefinition = NonNullable<ReturnType<typeof parseMarkdownSteps>>;
