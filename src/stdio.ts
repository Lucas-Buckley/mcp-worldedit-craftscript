import "./loadEnv.js";
import fs from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { registerTools } from "./registerTools.js";

const config = loadConfig();

/**
 * Local, stdio-only entrypoint: only reachable by spawning it directly on this machine (e.g. via
 * Claude Desktop's "Local MCP servers"), so there's no one to verify identity against — whoever
 * can launch this process already has full control of the machine and the Minecraft server files.
 * Grants full admin, scoped to the server's first listed op (or "local-admin" if there are none).
 */
function localAdminUsername(): string {
  try {
    const ops = JSON.parse(fs.readFileSync(config.opsFile, "utf-8")) as Array<{ name: string }>;
    if (ops.length > 0) return ops[0].name;
  } catch {
    // fall through
  }
  return "local-admin";
}

const trustedIdentity = { username: localAdminUsername(), admin: true };

const server = new McpServer({ name: "worldedit-craftscript-local", version: "0.1.0" });
registerTools(server, config, {
  resolveIdentity: () => trustedIdentity,
  includeVerificationTools: false,
});

const transport = new StdioServerTransport();
await server.connect(transport);
