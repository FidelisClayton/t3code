import { msg } from "gt-react";
import { ListTodo } from "lucide-react";

export function runAddActions(onAddRun: (() => void) | undefined) {
  return onAddRun
    ? [
        {
          label: msg("Run"),
          icon: ListTodo,
          shortcut: "R",
          available: true,
          disabledReason: "",
          onClick: onAddRun,
        },
      ]
    : [];
}
