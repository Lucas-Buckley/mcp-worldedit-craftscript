import { Rcon } from "rcon-client";
import type { Config } from "./config.js";

export class RconError extends Error {}

/** Strips Minecraft legacy formatting codes (§x) from command feedback. */
export function stripFormatting(text: string): string {
  return text.replace(/§./g, "");
}

/**
 * Sends a single command over RCON. Connects, authenticates, sends, and
 * disconnects per call — this tool is human-in-the-loop and low frequency,
 * so the reconnect cost is a non-issue and avoids stale-connection bugs
 * some Minecraft RCON implementations exhibit with long-lived sockets.
 */
export async function sendRconCommand(config: Config, command: string): Promise<string> {
  let rcon: Rcon;
  try {
    rcon = await Rcon.connect({
      host: config.rconHost,
      port: config.rconPort,
      password: config.rconPassword,
      timeout: config.rconTimeoutMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/ECONNREFUSED/.test(message)) {
      throw new RconError(
        "RCON connection refused. Is enable-rcon=true in server.properties, and was the server restarted after that change?"
      );
    }
    if (/auth/i.test(message) || /password/i.test(message)) {
      throw new RconError("RCON authentication failed — check RCON_PASSWORD matches rcon.password in server.properties.");
    }
    if (/timeout/i.test(message)) {
      throw new RconError(`RCON connection timed out after ${config.rconTimeoutMs}ms.`);
    }
    throw new RconError(`RCON connection failed: ${message}`);
  }

  try {
    const response = await rcon.send(command);
    return stripFormatting(response ?? "");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new RconError(`RCON command failed: ${message}`);
  } finally {
    try {
      await rcon.end();
    } catch {
      // Ignore errors closing an already-broken connection.
    }
  }
}
