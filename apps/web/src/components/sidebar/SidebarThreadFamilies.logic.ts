import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { SidebarSection } from "../Sidebar.logic";

export const FAMILY_SECTIONS = ["pinned", "active", "working", "snoozed", "settled"] as const;
export const threadShellKey = (thread: Pick<EnvironmentThreadShell, "environmentId" | "id">) =>
  scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
type SidebarFamilySections = Record<SidebarSection, readonly EnvironmentThreadShell[]>;

export function buildSidebarThreadFamilies(sections: SidebarFamilySections) {
  const threads = FAMILY_SECTIONS.flatMap((section) => sections[section]);
  const keyOf = threadShellKey;
  const byKey = new Map(threads.map((thread) => [keyOf(thread), thread]));
  const candidates = new Map<string, Set<string>>();
  for (const parent of threads) {
    const parentKey = keyOf(parent);
    for (const childId of parent.createdThreadIds) {
      const childKey = scopedThreadKey(scopeThreadRef(parent.environmentId, childId));
      const child = byKey.get(childKey);
      if (!child || child.projectId !== parent.projectId || childKey === parentKey) continue;
      const parents = candidates.get(childKey) ?? new Set<string>();
      parents.add(parentKey);
      candidates.set(childKey, parents);
    }
  }
  const parentByKey = new Map<string, string>();
  for (const [child, parents] of candidates) {
    if (parents.size === 1) parentByKey.set(child, [...parents][0]!);
  }
  const cyclic = new Set<string>();
  const checked = new Set<string>();
  for (const start of parentByKey.keys()) {
    const path = new Set<string>();
    let current: string | undefined = start;
    while (current !== undefined && !checked.has(current)) {
      if (path.has(current)) {
        const cycleStart = current;
        do {
          cyclic.add(current);
          current = parentByKey.get(current)!;
        } while (current !== cycleStart);
        break;
      }
      path.add(current);
      current = parentByKey.get(current);
    }
    for (const key of path) checked.add(key);
  }
  for (const key of cyclic) parentByKey.delete(key);
  const childrenByKey = new Map<string, EnvironmentThreadShell[]>();
  const roots: EnvironmentThreadShell[] = [];
  for (const thread of threads) {
    const parent = parentByKey.get(keyOf(thread));
    if (parent === undefined) roots.push(thread);
    else {
      const siblings = childrenByKey.get(parent) ?? [];
      siblings.push(thread);
      childrenByKey.set(parent, siblings);
    }
  }
  const rank = new Map(threads.map((thread, index) => [keyOf(thread), index]));
  const ownSection = new Map(
    FAMILY_SECTIONS.flatMap((section) =>
      sections[section].map((thread) => [keyOf(thread), section] as const),
    ),
  );
  const result: Record<SidebarSection, EnvironmentThreadShell[]> = {
    pinned: [],
    active: [],
    working: [],
    snoozed: [],
    settled: [],
  };
  const familyRank = new Map<string, number>();
  for (const root of roots) {
    const members = [root];
    for (let index = 0; index < members.length; index++) {
      members.push(...(childrenByKey.get(keyOf(members[index]!)) ?? []));
    }
    const representative = members.reduce((best, member) =>
      rank.get(keyOf(member))! < rank.get(keyOf(best))! ? member : best,
    );
    const rootKey = keyOf(root);
    familyRank.set(rootKey, rank.get(keyOf(representative))!);
    result[ownSection.get(keyOf(representative))!].push(root);
  }
  for (const section of FAMILY_SECTIONS) {
    result[section].sort(
      (left, right) =>
        familyRank.get(keyOf(left))! - familyRank.get(keyOf(right))! ||
        keyOf(left).localeCompare(keyOf(right)),
    );
  }
  return { sections: result, parentByKey, childrenByKey, ownSection };
}

export function flattenSidebarThreadFamilies(
  forest: ReturnType<typeof buildSidebarThreadFamilies>,
  roots: readonly EnvironmentThreadShell[],
  expandedByKey: Readonly<Record<string, boolean>>,
) {
  const rows: { thread: EnvironmentThreadShell; depth: number }[] = [];
  const visit = (thread: EnvironmentThreadShell, depth: number) => {
    rows.push({ thread, depth });
    const key = threadShellKey(thread);
    if (expandedByKey[key] !== false) {
      for (const child of forest.childrenByKey.get(key) ?? []) visit(child, depth + 1);
    }
  };
  for (const root of roots) visit(root, 0);
  return rows;
}

export type SidebarThreadFamilies = ReturnType<typeof buildSidebarThreadFamilies>;

// What a row needs to know about its place in a thread family.
export function resolveSidebarFamilyRow(
  families: SidebarThreadFamilies | null,
  threadKey: string,
  displaySection: SidebarSection,
  expandedByKey: Readonly<Record<string, boolean>>,
) {
  const parent = families?.parentByKey.get(threadKey);
  const children = families?.childrenByKey.get(threadKey);
  let depth = 0;
  for (
    let ancestor = parent;
    ancestor !== undefined;
    ancestor = families?.parentByKey.get(ancestor)
  ) {
    depth++;
  }
  return {
    section: families?.ownSection.get(threadKey) ?? displaySection,
    parent,
    inFamily: Boolean(parent || children?.length),
    depth,
    expanded: children?.length ? expandedByKey[threadKey] !== false : undefined,
    hiddenDescendants:
      families !== null && expandedByKey[threadKey] === false
        ? flattenSidebarThreadFamilies(families, children ?? [], {}).map((row) => row.thread)
        : undefined,
  };
}
