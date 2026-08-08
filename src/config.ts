import path from "node:path";

export interface Config {
  rconHost: string;
  rconPort: number;
  rconPassword: string;
  craftscriptsDir: string;
  serverLogPath: string | null;
  rconTimeoutMs: number;
  logTailTimeoutMs: number;
  httpHost: string;
  httpPort: number;
  opsFile: string;
  devicesFile: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable ${name}. Set it in the MCP client config's "env" block (see .env.example).`
    );
  }
  return value;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) {
    throw new Error(`Environment variable ${name} must be an integer, got ${JSON.stringify(raw)}.`);
  }
  return n;
}

export function loadConfig(): Config {
  const craftscriptsDir = path.resolve(requireEnv("CRAFTSCRIPTS_DIR"));
  const serverLogPathRaw = process.env.SERVER_LOG_PATH;

  return {
    rconHost: process.env.RCON_HOST?.trim() || "127.0.0.1",
    rconPort: intEnv("RCON_PORT", 25575),
    rconPassword: requireEnv("RCON_PASSWORD"),
    craftscriptsDir,
    serverLogPath: serverLogPathRaw ? path.resolve(serverLogPathRaw) : null,
    rconTimeoutMs: intEnv("RCON_TIMEOUT_MS", 5000),
    logTailTimeoutMs: intEnv("LOG_TAIL_TIMEOUT_MS", 3000),
    // 0.0.0.0 so it's reachable from your router's port-forwarded WAN traffic, not just localhost.
    httpHost: process.env.MCP_HTTP_HOST?.trim() || "0.0.0.0",
    httpPort: intEnv("MCP_HTTP_PORT", 8787),
    opsFile: path.resolve(requireEnv("OPS_FILE")),
    devicesFile: path.resolve(process.env.DEVICES_FILE?.trim() || "devices.json"),
  };
}
