import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "./config.js";
import type { Identity } from "./identity.js";

import { injectCraftscript, injectCraftscriptSchema } from "./tools/injectCraftscript.js";
import { listCraftscripts, listCraftscriptsSchema } from "./tools/listCraftscripts.js";
import { readCraftscript, readCraftscriptSchema } from "./tools/readCraftscript.js";
import { deleteCraftscript, deleteCraftscriptSchema } from "./tools/deleteCraftscript.js";
import { runCraftscript, runCraftscriptSchema } from "./tools/runCraftscript.js";
import { getSelectionInfo, getSelectionInfoSchema } from "./tools/getSelectionInfo.js";
import { undo, undoSchema } from "./tools/undo.js";
import { requestLoginCode, requestLoginCodeSchema } from "./tools/requestLoginCode.js";
import { verifyLoginCode, verifyLoginCodeSchema } from "./tools/verifyLoginCode.js";

function asToolResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function asErrorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

export interface RegisterToolsOptions {
  /** Resolves the caller's identity for a given tool call. */
  resolveIdentity: (extra: { sessionId?: string }) => Identity | null;
  /**
   * Whether to register request_login_code/verify_login_code. Skip these for transports that
   * are inherently trusted (e.g. local stdio, launched directly by the machine's own user) —
   * there's nothing meaningful to verify there.
   */
  includeVerificationTools: boolean;
}

/** Registers every worldedit-craftscript tool on an McpServer. Shared by the HTTP and stdio entrypoints. */
export function registerTools(server: McpServer, config: Config, options: RegisterToolsOptions): void {
  const { resolveIdentity, includeVerificationTools } = options;

  if (includeVerificationTools) {
    server.tool(
      "request_login_code",
      "Start identity verification for a Minecraft username: sends a one-time code to that " +
        "player in-game via a private message. The player must be online right now. Call " +
        "verify_login_code with the code afterwards.",
      requestLoginCodeSchema,
      async (args) => {
        try {
          return asToolResult(await requestLoginCode(config, args));
        } catch (err) {
          return asErrorResult(err);
        }
      }
    );

    server.tool(
      "verify_login_code",
      "Completes identity verification with the code the player read in-game. On success, this " +
        "chat session is authenticated as that username (server ops get admin access), and a " +
        "persistent device token is returned — save it as a permanent Authorization header in " +
        "your MCP client config to skip this step in future sessions.",
      verifyLoginCodeSchema,
      async (args, extra) => {
        try {
          return asToolResult(await verifyLoginCode(config, args, extra.sessionId));
        } catch (err) {
          return asErrorResult(err);
        }
      }
    );
  }

  server.tool(
    "inject_craftscript",
    "Write a WorldEdit CraftScript (.js, Rhino dialect) into the server's craftscripts folder. " +
      "Does not validate JS syntax — WorldEdit surfaces errors when the script is actually run. " +
      "Requires a verified server-op identity.",
    injectCraftscriptSchema,
    async (args, extra) => {
      try {
        return asToolResult(await injectCraftscript(config, args, resolveIdentity(extra)));
      } catch (err) {
        return asErrorResult(err);
      }
    }
  );

  server.tool(
    "list_craftscripts",
    "List the .js craftscript files currently in the server's craftscripts folder. Requires a verified server-op identity.",
    listCraftscriptsSchema,
    async (_args, extra) => {
      try {
        return asToolResult(await listCraftscripts(config, resolveIdentity(extra)));
      } catch (err) {
        return asErrorResult(err);
      }
    }
  );

  server.tool(
    "read_craftscript",
    "Read back the source of an existing craftscript file. Requires a verified server-op identity.",
    readCraftscriptSchema,
    async (args, extra) => {
      try {
        return asToolResult(await readCraftscript(config, args, resolveIdentity(extra)));
      } catch (err) {
        return asErrorResult(err);
      }
    }
  );

  server.tool(
    "delete_craftscript",
    "Delete a craftscript file from the server. Only removes the script file itself " +
      "(no in-game effect on blocks already placed) — confirm with the user before calling this. " +
      "Requires a verified server-op identity.",
    deleteCraftscriptSchema,
    async (args, extra) => {
      try {
        return asToolResult(await deleteCraftscript(config, args, resolveIdentity(extra)));
      } catch (err) {
        return asErrorResult(err);
      }
    }
  );

  server.tool(
    "run_craftscript",
    "Run a craftscript as a specific in-game player, using that player's active WorldEdit " +
      "selection and adding the edit to their own //undo history. The player must be verified, " +
      "online, and, if the script needs one, must already have made a WorldEdit selection. " +
      "Non-admin identities may only run as their own verified username.",
    runCraftscriptSchema,
    async (args, extra) => {
      try {
        return asToolResult(await runCraftscript(config, args, resolveIdentity(extra)));
      } catch (err) {
        return asErrorResult(err);
      }
    }
  );

  server.tool(
    "get_selection_info",
    "Check whether a player has an active WorldEdit selection and report its type/size/volume. " +
      "Does not return exact coordinates (WorldEdit doesn't expose them this way) — only shape and size. " +
      "Non-admin identities may only inspect their own verified username.",
    getSelectionInfoSchema,
    async (args, extra) => {
      try {
        return asToolResult(await getSelectionInfo(config, args, resolveIdentity(extra)));
      } catch (err) {
        return asErrorResult(err);
      }
    }
  );

  server.tool(
    "undo",
    "Undo a player's last N WorldEdit operations on their behalf, via RCON. Non-admin identities " +
      "may only undo as their own verified username.",
    undoSchema,
    async (args, extra) => {
      try {
        return asToolResult(await undo(config, args, resolveIdentity(extra)));
      } catch (err) {
        return asErrorResult(err);
      }
    }
  );
}
