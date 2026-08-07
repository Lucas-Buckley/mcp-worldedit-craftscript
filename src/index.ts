import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";

import { injectCraftscript, injectCraftscriptSchema } from "./tools/injectCraftscript.js";
import { listCraftscripts, listCraftscriptsSchema } from "./tools/listCraftscripts.js";
import { readCraftscript, readCraftscriptSchema } from "./tools/readCraftscript.js";
import { deleteCraftscript, deleteCraftscriptSchema } from "./tools/deleteCraftscript.js";
import { runCraftscript, runCraftscriptSchema } from "./tools/runCraftscript.js";
import { getSelectionInfo, getSelectionInfoSchema } from "./tools/getSelectionInfo.js";
import { undo, undoSchema } from "./tools/undo.js";

const config = loadConfig();

const server = new McpServer({
  name: "worldedit-craftscript",
  version: "0.1.0",
});

function asToolResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function asErrorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

server.tool(
  "inject_craftscript",
  "Write a WorldEdit CraftScript (.js, Rhino dialect) into the server's craftscripts folder. " +
    "Does not validate JS syntax — WorldEdit surfaces errors when the script is actually run.",
  injectCraftscriptSchema,
  async (args) => {
    try {
      return asToolResult(await injectCraftscript(config, args));
    } catch (err) {
      return asErrorResult(err);
    }
  }
);

server.tool(
  "list_craftscripts",
  "List the .js craftscript files currently in the server's craftscripts folder.",
  listCraftscriptsSchema,
  async () => {
    try {
      return asToolResult(await listCraftscripts(config));
    } catch (err) {
      return asErrorResult(err);
    }
  }
);

server.tool(
  "read_craftscript",
  "Read back the source of an existing craftscript file.",
  readCraftscriptSchema,
  async (args) => {
    try {
      return asToolResult(await readCraftscript(config, args));
    } catch (err) {
      return asErrorResult(err);
    }
  }
);

server.tool(
  "delete_craftscript",
  "Delete a craftscript file from the server. Only removes the script file itself " +
    "(no in-game effect on blocks already placed) — confirm with the user before calling this.",
  deleteCraftscriptSchema,
  async (args) => {
    try {
      return asToolResult(await deleteCraftscript(config, args));
    } catch (err) {
      return asErrorResult(err);
    }
  }
);

server.tool(
  "run_craftscript",
  "Run a craftscript as a specific in-game player, using that player's active WorldEdit " +
    "selection and adding the edit to their own //undo history. The player must be online " +
    "and, if the script needs one, must already have made a WorldEdit selection.",
  runCraftscriptSchema,
  async (args) => {
    try {
      return asToolResult(await runCraftscript(config, args));
    } catch (err) {
      return asErrorResult(err);
    }
  }
);

server.tool(
  "get_selection_info",
  "Check whether a player has an active WorldEdit selection and report its type/size/volume. " +
    "Does not return exact coordinates (WorldEdit doesn't expose them this way) — only shape and size.",
  getSelectionInfoSchema,
  async (args) => {
    try {
      return asToolResult(await getSelectionInfo(config, args));
    } catch (err) {
      return asErrorResult(err);
    }
  }
);

server.tool(
  "undo",
  "Undo a player's last N WorldEdit operations on their behalf, via RCON.",
  undoSchema,
  async (args) => {
    try {
      return asToolResult(await undo(config, args));
    } catch (err) {
      return asErrorResult(err);
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
