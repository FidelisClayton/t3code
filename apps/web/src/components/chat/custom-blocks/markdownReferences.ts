import type { MarkdownReferenceDefinition } from "@t3tools/contracts";
import { extractMarkdownReferenceDefinitions } from "@t3tools/shared/markdownReferences";
import { splitMarkdownBlocks } from "../markdownStreamBlocks";

export interface MarkdownReferenceMessage {
  readonly id: string;
  readonly text: string;
  readonly revision?: string;
}

export function createMarkdownReferenceIndex() {
  type CachedMessage = {
    source: string;
    revision: string | undefined;
    text: string;
    blocks: Map<string, readonly MarkdownReferenceDefinition[]>;
    definitions: readonly MarkdownReferenceDefinition[];
  };
  const messages = new Map<string, CachedMessage>();
  const listeners = new Set<() => void>();
  let definitions: ReadonlyMap<string, MarkdownReferenceDefinition> = new Map();

  function parse(text: string, previous?: CachedMessage): CachedMessage {
    const blocks = new Map<string, readonly MarkdownReferenceDefinition[]>();
    const parsedDefinitions: MarkdownReferenceDefinition[] = [];
    // Ordinary assistant prose never needs a second Markdown parse.
    if (/(?:`{3,}|~{3,})[ \t]*reference\b/.test(text)) {
      for (const block of splitMarkdownBlocks(text) ?? [text]) {
        const source = block.trimEnd();
        if (!/(?:`{3,}|~{3,})[ \t]*reference\b/.test(source)) continue;
        const parsed = previous?.blocks.get(source) ?? extractMarkdownReferenceDefinitions(source);
        blocks.set(source, parsed);
        parsedDefinitions.push(...parsed);
      }
    }
    return {
      source: text,
      revision: previous?.revision,
      text,
      blocks,
      definitions: parsedDefinitions,
    };
  }

  function publish() {
    const next = new Map<string, MarkdownReferenceDefinition>();
    for (const message of messages.values()) {
      for (const definition of message.definitions) {
        const previous = definitions.get(definition.id);
        next.set(
          definition.id,
          previous?.title === definition.title &&
            previous.summary === definition.summary &&
            previous.body === definition.body
            ? previous
            : definition,
        );
      }
    }
    if (
      next.size === definitions.size &&
      [...next].every(([id, value]) => definitions.get(id) === value)
    )
      return;
    definitions = next;
    for (const listener of listeners) listener();
  }

  return {
    snapshot: () => definitions,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    replace(input: readonly MarkdownReferenceMessage[]) {
      const next = input.map(({ id, text, revision }) => {
        const previous = messages.get(id);
        return [
          id,
          previous?.source === text && previous.revision === revision
            ? previous
            : { ...parse(text, previous), revision },
        ] as const;
      });
      messages.clear();
      for (const [id, message] of next) messages.set(id, message);
      publish();
    },
    stream(id: string, text: string) {
      const previous = messages.get(id);
      if (!previous || previous.text === text) return;
      const next = { ...parse(text, previous), source: previous.source };
      messages.set(id, next);
      if (
        next.definitions.length === previous.definitions.length &&
        next.definitions.every((definition, index) => {
          const prior = previous.definitions[index];
          return (
            prior?.id === definition.id &&
            prior.title === definition.title &&
            prior.summary === definition.summary &&
            prior.body === definition.body
          );
        })
      )
        return;
      publish();
    },
  };
}
