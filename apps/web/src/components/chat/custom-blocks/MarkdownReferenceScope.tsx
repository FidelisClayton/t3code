import type { MarkdownReferenceDefinition } from "@t3tools/contracts";
import {
  createContext,
  use,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createMarkdownReferenceIndex, type MarkdownReferenceMessage } from "./markdownReferences";

const MarkdownReferenceContext = createContext<ReturnType<
  typeof createMarkdownReferenceIndex
> | null>(null);
const NO_REFERENCES = new Map<string, MarkdownReferenceDefinition>();
const emptySnapshot = () => NO_REFERENCES;
const emptySubscribe = () => () => {};

export function MarkdownReferenceProvider({
  messages,
  children,
}: {
  messages: readonly MarkdownReferenceMessage[];
  children: ReactNode;
}) {
  const [index] = useState(() => {
    const index = createMarkdownReferenceIndex();
    index.replace(messages);
    return index;
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- synchronizes loaded conversation history with the external reference index independently of virtualized rows
  useLayoutEffect(() => {
    index.replace(messages);
  }, [index, messages]);
  return <MarkdownReferenceContext value={index}>{children}</MarkdownReferenceContext>;
}

export function MarkdownReferenceScope({
  text,
  enabled,
  children,
}: {
  text: string;
  enabled: boolean;
  children: ReactNode;
}) {
  const index = use(MarkdownReferenceContext);
  return enabled && index === null ? (
    <MarkdownReferenceProvider messages={[{ id: "message", text }]}>
      {children}
    </MarkdownReferenceProvider>
  ) : (
    children
  );
}

export function useStreamedMarkdownReferences(id: string, text: string) {
  const index = use(MarkdownReferenceContext);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- publishes only changed closed definitions to the external conversation index, without subscribing the timeline to token deltas
  useLayoutEffect(() => {
    index?.stream(id, text);
  }, [index, id, text]);
}

export function useMarkdownReference(id: string) {
  const index = use(MarkdownReferenceContext);
  const definitions = useSyncExternalStore(
    index?.subscribe ?? emptySubscribe,
    index?.snapshot ?? emptySnapshot,
  );
  return definitions.get(id);
}
