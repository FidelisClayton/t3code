import { ORCHESTRATION_PROTOCOL_HEADER } from "@t3tools/contracts";
import { forkScheme, resolveForkId } from "@t3tools/shared/forkBuild";

import packageJson from "../package.json" with { type: "json" };

export const browserApiCorsAllowedMethods = ["GET", "POST", "OPTIONS"] as const;
export const browserApiCorsAllowedHeaders = [
  "authorization",
  "b3",
  "traceparent",
  "content-type",
  "dpop",
  ORCHESTRATION_PROTOCOL_HEADER,
] as const;

const forkId = resolveForkId(packageJson.version);

// A fork-built server also trusts the renderer of the desktop app built from the same fork.
export const DESKTOP_RENDERER_ORIGINS: ReadonlyArray<string> = [
  "t3code://app",
  "t3code-dev://app",
  ...(forkId === undefined ? [] : [`${forkScheme(forkId)}://app`]),
];

/** MCP refuses every browser Origin with 403, so the browser CORS layer must not answer for it. */
export const MCP_HTTP_PATH = "/mcp";
