import "./loadEnv.js";
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
import { registerTools } from "./registerTools.js";

const config = loadConfig();

/** One shared McpServer (tool definitions are stateless); each session gets its own transport. */
const mcpServer = new McpServer({ name: "worldedit-craftscript", version: "0.1.0" });
registerTools(mcpServer, config, {
  resolveIdentity: (extra) => getSessionIdentity(extra.sessionId),
  includeVerificationTools: true,
});

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

function applyCors(req: http.IncomingMessage, res: http.ServerResponse): void {
  // MCP clients that run in a browser-like renderer (e.g. Electron) may issue this as a
  // same-origin-restricted fetch(); without these headers such a client can silently fail
  // to read an otherwise-successful response.
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] ?? "Content-Type, Authorization, Mcp-Session-Id"
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
}

async function main() {
  const requestHandler: http.RequestListener = (req, res) => {
    applyCors(req, res);

    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

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
