import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { useEffect } from "react";
import { useOlderSettledShelfGrowth } from "../../state/olderSettledShelf";
import type { useOlderSettledShelf } from "../../state/olderSettledShelf";
import { useUiStateStore } from "../../uiStateStore";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import { sidebarFolderExpansionKeys } from "../Sidebar.logic";
import {
  buildSidebarThreadFamilies,
  flattenSidebarThreadFamilies,
} from "./SidebarThreadFamilies.logic";

const threadShellKey = (thread: Pick<EnvironmentThreadShell, "environmentId" | "id">) =>
  scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));

type SidebarFamilyPartition = Record<
  "pinnedThreads" | "activeThreads" | "workingThreads" | "snoozedThreads" | "settledThreads",
  readonly EnvironmentThreadShell[]
>;

// Nests created threads under their parent in boring mode (`folderGroups` set) and reveals the
// routed thread: its ancestors, folder, and settled or snoozed shelf open once.
export function useSidebarThreadFamilies<Partition extends SidebarFamilyPartition>(input: {
  readonly basePartition: Partition;
  readonly olderSettledShelf: ReturnType<typeof useOlderSettledShelf>;
  readonly folderGroups: readonly SidebarProjectSnapshot[] | null;
  readonly routeRowThreadKey: string | null;
  readonly shelfRouteThreadKey: string | null;
  readonly revealKey: string | null;
  readonly setProjectExpanded: (keys: readonly string[], expanded: boolean) => void;
  readonly setSettledShelfExpanded: (expanded: boolean) => void;
  readonly setSnoozedShelfExpanded: (expanded: boolean) => void;
}) {
  const {
    basePartition,
    olderSettledShelf,
    folderGroups,
    routeRowThreadKey,
    shelfRouteThreadKey,
    revealKey,
    setProjectExpanded,
    setSettledShelfExpanded,
    setSnoozedShelfExpanded,
  } = input;
  const listedSettledMembers = basePartition.settledThreads.filter(olderSettledShelf.isListed);
  useOlderSettledShelfGrowth(olderSettledShelf, listedSettledMembers);
  const families =
    folderGroups === null
      ? null
      : buildSidebarThreadFamilies({
          pinned: basePartition.pinnedThreads,
          active: basePartition.activeThreads,
          working: basePartition.workingThreads,
          snoozed: basePartition.snoozedThreads,
          settled: basePartition.settledThreads.filter(
            (thread) =>
              olderSettledShelf.isListed(thread) || threadShellKey(thread) === routeRowThreadKey,
          ),
        });
  const partition =
    families === null
      ? basePartition
      : {
          ...basePartition,
          pinnedThreads: families.sections.pinned,
          activeThreads: families.sections.active,
          workingThreads: families.sections.working,
          snoozedThreads: families.sections.snoozed,
          settledThreads: families.sections.settled,
        };
  const expandedByKey = useUiStateStore((store) => store.sidebarThreadExpandedByKey);
  const setThreadExpanded = useUiStateStore((store) => store.setSidebarThreadExpanded);
  const revealAncestors: string[] = [];
  let revealRoot = revealKey;
  if (families !== null && revealRoot !== null) {
    let parent = families.parentByKey.get(revealRoot);
    while (parent !== undefined) {
      revealAncestors.push(parent);
      revealRoot = parent;
      parent = families.parentByKey.get(parent);
    }
  }
  const familyExpandedByKey =
    revealAncestors.length === 0
      ? expandedByKey
      : {
          ...expandedByKey,
          ...Object.fromEntries(revealAncestors.map((key) => [key, true])),
        };
  const flatten = (list: readonly EnvironmentThreadShell[]) =>
    families === null
      ? list
      : flattenSidebarThreadFamilies(families, list, familyExpandedByKey).map((row) => row.thread);
  const familyMembers = (list: readonly EnvironmentThreadShell[]) =>
    families === null
      ? list
      : flattenSidebarThreadFamilies(families, list, {}).map((row) => row.thread);
  const revealFamilySection =
    revealRoot === null || families === null
      ? undefined
      : (["pinned", "active", "working", "snoozed", "settled"] as const).find((section) =>
          families.sections[section].some((thread) => threadShellKey(thread) === revealRoot),
        );
  const revealFolder = folderGroups?.find((group) =>
    group.memberProjectRefs.some((ref) =>
      partition.activeThreads.some(
        (thread) =>
          threadShellKey(thread) === revealRoot &&
          thread.environmentId === ref.environmentId &&
          thread.projectId === ref.projectId,
      ),
    ),
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- persists the one-shot route reveal into sidebar preferences before its row consumes it
  useEffect(() => {
    if (families === null || revealKey === null) return;
    if (revealAncestors.length > 0) setThreadExpanded(revealAncestors, true);
    if (revealFolder !== undefined)
      setProjectExpanded(sidebarFolderExpansionKeys(revealFolder), true);
    if (revealFamilySection === "settled") setSettledShelfExpanded(true);
    if (revealFamilySection === "snoozed") setSnoozedShelfExpanded(true);
  }, [
    families,
    revealKey,
    revealAncestors,
    revealFolder,
    revealFamilySection,
    setThreadExpanded,
    setProjectExpanded,
    setSettledShelfExpanded,
    setSnoozedShelfExpanded,
  ]);
  // The root of the routed thread's family is what the shelves list.
  let routeFamilyRoot = shelfRouteThreadKey;
  while (routeFamilyRoot !== null && families?.parentByKey.has(routeFamilyRoot)) {
    routeFamilyRoot = families.parentByKey.get(routeFamilyRoot)!;
  }
  return {
    partition,
    families,
    familyExpandedByKey,
    toggleThreadFamily: (key: string) =>
      setThreadExpanded([key], familyExpandedByKey[key] === false),
    flatten,
    familyMembers,
    revealFolder,
    revealFamilySection,
    routeFamilyRoot,
  };
}
