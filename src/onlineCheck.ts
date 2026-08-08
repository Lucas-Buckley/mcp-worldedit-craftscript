import type { Config } from "./config.js";
import { sendRconCommand } from "./rcon.js";
import { buildListCommand } from "./commandBuilder.js";

/** Checks whether a username currently appears in the server's `list` command output. */
export async function isPlayerOnline(config: Config, username: string): Promise<boolean> {
  const response = await sendRconCommand(config, buildListCommand());
  const colonIndex = response.indexOf(":");
  if (colonIndex === -1) return false;
  const names = response
    .slice(colonIndex + 1)
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
  return names.some((n) => n.toLowerCase() === username.toLowerCase());
}
