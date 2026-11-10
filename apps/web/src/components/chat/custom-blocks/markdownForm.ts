import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const fieldProperties = {
  name: Schema.String,
  label: Schema.String,
  required: Schema.optionalKey(Schema.Boolean),
};
const MarkdownForm = Schema.Struct({
  title: Schema.String,
  fields: Schema.Array(
    Schema.Union([
      Schema.Struct({ ...fieldProperties, type: Schema.Literal("text") }),
      Schema.Struct({
        ...fieldProperties,
        type: Schema.Literal("select"),
        options: Schema.NonEmptyArray(Schema.String),
      }),
    ]),
  ),
  submitLabel: Schema.optionalKey(Schema.String),
});

export type MarkdownFormDefinition = typeof MarkdownForm.Type;

const decodeForm = Schema.decodeUnknownOption(Schema.fromJsonString(MarkdownForm));

export function parseMarkdownForm(source: string): MarkdownFormDefinition | null {
  const form = Option.getOrNull(decodeForm(source));
  return form && new Set(form.fields.map((field) => field.name)).size === form.fields.length
    ? form
    : null;
}
