const FORK_BUILD_METADATA = /\+([a-z][a-z0-9-]*)\.\d+$/;

/** A fork stamps `+<forkId>.<n>` build metadata on its version; official versions carry none. */
export const resolveForkId = (version: string): string | undefined =>
  FORK_BUILD_METADATA.exec(version)?.[1];

export const stripBuildMetadata = (version: string): string => version.replace(/\+.*$/, "");

export const forkAppId = (forkId: string): string => `dev.${forkId}.t3code`;

export const forkScheme = (forkId: string): string => `t3code-${forkId}`;

export const forkLabel = (forkId: string): string =>
  forkId.charAt(0).toUpperCase() + forkId.slice(1);
