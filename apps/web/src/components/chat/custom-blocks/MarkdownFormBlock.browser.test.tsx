import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "../../../../test/render";
import { MarkdownFormBlock } from "./MarkdownFormBlock";
import "../../../index.css";

const form = {
  title: "Trip",
  fields: [
    { type: "text", name: "destination", label: "Destination", required: true },
    {
      type: "select",
      name: "transport",
      label: "Transport",
      options: ["Train", "Bus"],
      required: true,
    },
  ],
} as const;

it("validates required answers, sends structured values once and confirms completion", async () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  const onSendMessage = vi.fn(() => promise);
  await using screen = await render(
    <MarkdownFormBlock form={form} onSendMessage={onSendMessage} />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Send answers" }));
  expect(onSendMessage).not.toHaveBeenCalled();
  await userEvent.fill(screen.getByRole("textbox", { name: "Destination" }), "Lisbon");
  await userEvent.click(screen.getByRole("combobox", { name: "Transport" }));
  await userEvent.click(screen.getByRole("option", { name: "Train", exact: true }));
  await userEvent.click(screen.getByRole("button", { name: "Send answers" }));
  await expect.element(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
  expect(onSendMessage).toHaveBeenCalledExactlyOnceWith(
    'Trip\n\n{\n  "destination": "Lisbon",\n  "transport": "Train"\n}',
  );
  resolve();
  await expect.element(screen.getByRole("status")).toHaveTextContent("Answers sent");
  await expect.element(screen.getByRole("button", { name: "Answers sent" })).toBeDisabled();
});

it("preserves answers after a failed send and permits retry", async () => {
  const onSendMessage = vi
    .fn()
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce(undefined);
  await using screen = await render(
    <MarkdownFormBlock
      form={{ ...form, fields: [form.fields[0]!] }}
      onSendMessage={onSendMessage}
    />,
  );
  await userEvent.fill(screen.getByRole("textbox", { name: "Destination" }), "Lisbon");
  await userEvent.click(screen.getByRole("button", { name: "Send answers" }));
  await expect.element(screen.getByRole("alert")).toHaveTextContent("Offline");
  await expect.element(screen.getByRole("textbox", { name: "Destination" })).toHaveValue("Lisbon");
  await userEvent.click(screen.getByRole("button", { name: "Send answers" }));
  await expect.element(screen.getByRole("status")).toHaveTextContent("Answers sent");
  expect(onSendMessage).toHaveBeenCalledTimes(2);
});
