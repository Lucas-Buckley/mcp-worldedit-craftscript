import net from "node:net";
import type { Config } from "./config.js";

export class BridgeError extends Error {}

export interface BridgeResult {
  ok: boolean;
  returnValue?: number;
  error?: string;
}

/**
 * Talks to the weditmcpbridge NeoForge mod's localhost TCP endpoint, which dispatches a
 * command using a real ServerPlayer's own CommandSourceStack — the only way found to make
 * WorldEdit recognize the command as genuinely coming from that player (RCON's "execute as"
 * does not work for this; see commandBuilder.ts and the project README for why).
 */
export function sendBridgeCommand(config: Config, username: string, command: string): Promise<BridgeResult> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: config.bridgeHost, port: config.bridgePort });
    let buffer = "";
    let settled = false;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err);
    };

    socket.setTimeout(config.bridgeTimeoutMs);

    socket.on("connect", () => {
      socket.write(JSON.stringify({ username, command }) + "\n");
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf-8");
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex !== -1 && !settled) {
        settled = true;
        const line = buffer.slice(0, newlineIndex);
        socket.end();
        try {
          resolve(JSON.parse(line) as BridgeResult);
        } catch (err) {
          reject(new BridgeError(`Malformed response from weditmcpbridge: ${line}`));
        }
      }
    });

    socket.on("timeout", () => {
      fail(new BridgeError(`weditmcpbridge request timed out after ${config.bridgeTimeoutMs}ms.`));
    });

    socket.on("error", (err) => {
      fail(
        new BridgeError(
          `Could not reach weditmcpbridge at ${config.bridgeHost}:${config.bridgePort} — is the weditmcpbridge mod installed and the Minecraft server running? (${err.message})`
        )
      );
    });
  });
}
