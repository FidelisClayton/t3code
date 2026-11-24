import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useGT } from "gt-react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "~/lib/utils";
import type { SidebarThreadSummary } from "../../types";
import { useUiStateStore } from "../../uiStateStore";
import { resolveSidebarFolderDot, resolveThreadLastVisitedAt } from "../Sidebar.logic";

export type SidebarFamilyRowProps = {
  familyDepth?: number;
  familyExpanded?: boolean | undefined;
  onToggleFamily?: ((key: string) => void) | undefined;
  hiddenDescendants?: readonly SidebarThreadSummary[] | undefined;
};

export function familyRowIndent(
  inFolder: boolean,
  depth: number | undefined,
): CSSProperties | undefined {
  return inFolder ? { paddingInlineStart: 36 + (depth ?? 0) * 16 } : undefined;
}

export function SidebarFamilyDisclosure(props: { expanded: boolean; onToggle: () => void }) {
  const gt = useGT();
  return (
    <span className="relative -ms-6 size-3.5 shrink-0">
      <button
        type="button"
        tabIndex={-1}
        data-sidebar-disclosure
        aria-label={props.expanded ? gt("Collapse created threads") : gt("Expand created threads")}
        aria-expanded={props.expanded}
        onClick={(event) => {
          event.stopPropagation();
          props.onToggle();
        }}
        className="absolute -start-1.25 [inset-block-start:-5px] flex size-6 cursor-pointer items-center justify-center rounded-sm text-secondary-label active:text-foreground focus-visible:outline-2 focus-visible:outline-ring [@media(pointer:coarse)]:h-8 [@media(pointer:coarse)]:[inset-block-start:-9px]"
      >
        {props.expanded ? (
          <ChevronDownIcon aria-hidden className="size-3.5" />
        ) : (
          <ChevronRightIcon aria-hidden className="size-3.5" />
        )}
      </button>
    </span>
  );
}

export function SidebarDescendantAttentionBadge(props: {
  hiddenDescendants: readonly SidebarThreadSummary[] | undefined;
}) {
  const gt = useGT();
  const localVisits = useUiStateStore((state) =>
    props.hiddenDescendants?.length ? state.threadLastVisitedAtById : undefined,
  );
  const descendantAttention = resolveSidebarFolderDot(
    (props.hiddenDescendants ?? []).map((descendant) => ({
      ...descendant,
      lastVisitedAt: resolveThreadLastVisitedAt(
        descendant.lastVisitedAt,
        localVisits?.[scopedThreadKey(scopeThreadRef(descendant.environmentId, descendant.id))],
      ),
    })),
  );
  if (descendantAttention === null) return null;
  return (
    <span
      role="status"
      aria-label={gt("Created threads: {state}", {
        state: {
          attention: gt("needs you"),
          failed: gt("failed"),
          unread: gt("done"),
          working: gt("working"),
        }[descendantAttention],
      })}
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        {
          attention: "bg-warning",
          failed: "bg-error",
          unread: "bg-success",
          working: "bg-info",
        }[descendantAttention],
      )}
    />
  );
}
