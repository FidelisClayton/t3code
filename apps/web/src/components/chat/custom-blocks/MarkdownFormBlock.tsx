import { useId, useState } from "react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../../ui/select";
import type { MarkdownFormDefinition } from "./markdownForm";

export function MarkdownFormBlock({
  form,
  onSendMessage,
}: {
  form: MarkdownFormDefinition;
  onSendMessage?: ((text: string) => Promise<void>) | undefined;
}) {
  const id = useId();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(form.fields.map((field) => [field.name, ""])),
  );
  const [status, setStatus] = useState<"idle" | "pending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const disabled = status !== "idle" || !onSendMessage;

  return (
    <form
      aria-labelledby={`${id}-title`}
      className="grid gap-4 rounded-xl border border-border bg-card p-4 text-sm"
      onSubmit={async (event) => {
        event.preventDefault();
        if (disabled || !onSendMessage) return;
        const missing = form.fields.find((field) => field.required && !values[field.name]);
        if (missing) {
          setError(`${missing.label} is required.`);
          return;
        }
        setStatus("pending");
        setError(null);
        try {
          await onSendMessage(`${form.title}\n\n${JSON.stringify(values, null, 2)}`);
          setStatus("sent");
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Could not send answers. Try again.");
          setStatus("idle");
        }
      }}
    >
      <div id={`${id}-title`} className="font-medium">
        {form.title}
      </div>
      {form.fields.map((field, index) => {
        const fieldId = `${id}-${index}`;
        return (
          <div key={field.name} className="grid gap-2">
            <Label htmlFor={fieldId}>{field.label}</Label>
            {field.type === "text" ? (
              <Input
                nativeInput
                id={fieldId}
                name={field.name}
                required={field.required}
                disabled={disabled}
                value={values[field.name]}
                onChange={(event) => setValues({ ...values, [field.name]: event.target.value })}
              />
            ) : (
              <Select
                name={field.name}
                required={field.required}
                disabled={disabled}
                value={values[field.name] || null}
                onValueChange={(value) => setValues({ ...values, [field.name]: value ?? "" })}
              >
                <SelectTrigger id={fieldId}>
                  <SelectValue placeholder="Choose an option" />
                </SelectTrigger>
                <SelectPopup>
                  {field.options.map((option, optionIndex) => (
                    // oxlint-disable-next-line react/no-array-index-key -- option strings may repeat
                    <SelectItem key={optionIndex} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            )}
          </div>
        );
      })}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      {status === "sent" ? <p role="status">Answers sent</p> : null}
      <div>
        <Button type="submit" disabled={disabled}>
          {status === "pending"
            ? "Sending…"
            : status === "sent"
              ? "Answers sent"
              : (form.submitLabel ?? "Send answers")}
        </Button>
      </div>
    </form>
  );
}
