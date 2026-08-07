import fs from "node:fs/promises";
import type { Config } from "./config.js";

/**
 * Fallback output channel: WorldEdit sometimes sends command/script feedback
 * (success messages, player.print calls, error text) only via the server's
 * chat/log pipeline rather than back through the RCON response. This polls
 * the server log file for new lines for a short window after a command is
 * dispatched, filtering to lines that plausibly relate to the command.
 */
export async function tailLogSince(
  config: Config,
  sinceOffsetBytes: number,
  matchHint: string
): Promise<string | null> {
  if (!config.serverLogPath) return null;

  const deadline = Date.now() + config.logTailTimeoutMs;
  let collected: string[] = [];

  while (Date.now() < deadline) {
    try {
      const stat = await fs.stat(config.serverLogPath);
      if (stat.size > sinceOffsetBytes) {
        const handle = await fs.open(config.serverLogPath, "r");
        try {
          const length = stat.size - sinceOffsetBytes;
          const buffer = Buffer.alloc(length);
          await handle.read(buffer, 0, length, sinceOffsetBytes);
          const text = buffer.toString("utf-8");
          const lines = text
            .split(/\r?\n/)
            .filter((line) => line.length > 0 && (matchHint === "" || line.includes(matchHint)));
          if (lines.length > 0) {
            collected = lines;
            break;
          }
        } finally {
          await handle.close();
        }
      }
    } catch {
      // Log file may not exist or be temporarily locked by the server; keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return collected.length > 0 ? collected.join("\n") : null;
}

/** Current size of the log file, used as the starting offset before dispatching a command. */
export async function currentLogOffset(config: Config): Promise<number> {
  if (!config.serverLogPath) return 0;
  try {
    const stat = await fs.stat(config.serverLogPath);
    return stat.size;
  } catch {
    return 0;
  }
}
