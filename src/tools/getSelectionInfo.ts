import { z } from "zod";
import type { Config } from "../config.js";
import { assertSafeUsername, buildSizeCommand } from "../commandBuilder.js";
import { sendBridgeCommand } from "../bridgeClient.js";
import { requireUsernameScope, type Identity } from "../identity.js";
import { isPlayerOnline } from "../onlineCheck.js";

export const getSelectionInfoSchema = {
  username: z.string().describe("In-game username of the player whose active WorldEdit selection to inspect."),
};

/**
 * Dispatches //size as the real player via the weditmcpbridge mod. WorldEdit sends its actual
 * type/size/volume text straight to the player's own chat — this tool can't currently capture
 * that text (would require deeper WorldEdit API integration in the bridge mod), so it only
 * reports whether the command ran successfully or threw (e.g. "no selection"). Ask the player
 * to read their own chat for the detailed breakdown.
 */
export async function getSelectionInfo(config: Config, args: { username: string }, identity: Identity | null) {
  requireUsernameScope(identity, args.username);
  assertSafeUsername(args.username);

  const online = await isPlayerOnline(config, args.username);
  if (!online) {
    return { ok: false, reason: `${args.username} is not currently online on the server.` };
  }

  const command = buildSizeCommand();
  const bridgeResult = await sendBridgeCommand(config, args.username, command);

  return {
    ...bridgeResult,
    note: "WorldEdit sends the actual selection details to the player's own in-game chat, not back to this tool. `ok: true` means the command ran without error (a selection exists); check with the player for specifics, or have them run /size themselves.",
  };
}
