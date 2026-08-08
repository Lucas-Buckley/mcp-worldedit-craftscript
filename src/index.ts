import "dotenv/config";
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { findDevice } from "./deviceStore.js";
import { getSessionIdentity, bindSession, unbindSession } from "./sessionIdentity.js";
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

const config = loadConfig();

function asToolResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function asErrorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

function buildServer(): McpServer {
  const server = new McpServer({ name: "worldedit-craftscript", version: "0.1.0" });

  // Unauthenticated: proves account ownership via an in-game whispered code.
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

  server.tool(
    "inject_craftscript",
    "Write a WorldEdit CraftScript (.js, Rhino dialect) into the server's craftscripts folder. " +
      "Does not validate JS syntax — WorldEdit surfaces errors when the script is actually run. " +
      "Requires a verified server-op identity.",
    injectCraftscriptSchema,
    async (args, extra) => {
      try {
        return asToolResult(await injectCraftscript(config, args, getSessionIdentity(extra.sessionId)));
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
        return asToolResult(await listCraftscripts(config, getSessionIdentity(extra.sessionId)));
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
        return asToolResult(await readCraftscript(config, args, getSessionIdentity(extra.sessionId)));
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
        return asToolResult(await deleteCraftscript(config, args, getSessionIdentity(extra.sessionId)));
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
        return asToolResult(await runCraftscript(config, args, getSessionIdentity(extra.sessionId)));
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
        return asToolResult(await getSelectionInfo(config, args, getSessionIdentity(extra.sessionId)));
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
        return asToolResult(await undo(config, args, getSessionIdentity(extra.sessionId)));
      } catch (err) {
        return asErrorResult(err);
      }
    }
  );

  return server;
}

/** One shared McpServer (tool definitions are stateless); each session gets its own transport. */
const mcpServer = buildServer();
const transports = new Map<string, StreamableHTTPServerTransport>();

function resolveHeaderIdentity(req: http.IncomingMessage): Identity | null {
  const authHeader = req.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) return null;
  const device = findDevice(config.devicesFile, match[1].trim());
  if (!device) return null;
  return { username: device.username, admin: device.admin };
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

async function handleMcpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const headerIdentity = resolveHeaderIdentity(req);
  const existingSessionId = req.headers["mcp-session-id"];
  const sessionIdHeader = Array.isArray(existingSessionId) ? existingSessionId[0] : existingSessionId;

  if (sessionIdHeader && transports.has(sessionIdHeader)) {
    // Existing session: re-bind identity from the header on every request so a saved
    // device token keeps working even if this server process restarted (in-memory
    // session bindings from verify_login_code don't survive a restart; the token does).
    if (headerIdentity) bindSession(sessionIdHeader, headerIdentity);
    await transports.get(sessionIdHeader)!.handleRequest(req, res);
    return;
  }

  if (sessionIdHeader) {
    sendJson(res, 404, { error: "Unknown or expired session. Reconnect to start a new one." });
    return;
  }

  // New session (expected to be an initialize request).
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (newSessionId) => {
      transports.set(newSessionId, transport);
      if (headerIdentity) bindSession(newSessionId, headerIdentity);
    },
  });
  transport.onclose = () => {
    if (transport.sessionId) {
      transports.delete(transport.sessionId);
      unbindSession(transport.sessionId);
    }
  };
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res);
}

async function main() {
  const requestHandler: http.RequestListener = (req, res) => {
    if (req.url !== "/mcp") {
      sendJson(res, 404, { error: "Not found. POST to /mcp." });
      return;
    }
    handleMcpRequest(req, res).catch((err) => {
      console.error("Error handling MCP request:", err);
      if (!res.headersSent) sendJson(res, 500, { error: "Internal server error." });
    });
  };

  const useTls = !!(config.tlsCertFile && config.tlsKeyFile);
  const httpServer = useTls
    ? https.createServer(
        { cert: fs.readFileSync(config.tlsCertFile!), key: fs.readFileSync(config.tlsKeyFile!) },
        requestHandler
      )
    : http.createServer(requestHandler);

  httpServer.listen(config.httpPort, config.httpHost, () => {
    const scheme = useTls ? "https" : "http";
    console.log(`worldedit-craftscript MCP server listening on ${scheme}://${config.httpHost}:${config.httpPort}/mcp`);
    console.log(`Devices file: ${config.devicesFile}`);
    console.log(`Ops file: ${config.opsFile}`);
  });

  const shutdown = () => {
    console.log("Shutting down worldedit-craftscript MCP server...");
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error starting worldedit-craftscript MCP server:", err);
  process.exit(1);
});
