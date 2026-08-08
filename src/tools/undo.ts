import { z } from "zod";
import type { Config } from "../config.js";
import { assertSafeUsername, buildUndoCommand } from "../commandBuilder.js";
import { sendBridgeCommand } from "../bridgeClient.js";
import { requireUsernameScope, type Identity } from "../identity.js";
import { isPlayerOnline } from "../onlineCheck.js";

export const undoSchema = {
  username: z.string().describe("In-game username of the player whose WorldEdit history to undo from."),
  times: z.number().int().positive().optional().default(1).describe("Number of operations to undo."),
};

export async function undo(config: Config, args: { username: string; times?: number }, identity: Identity | null) {
  requireUsernameScope(identity, args.username);
  assertSafeUsername(args.username);

  const online = await isPlayerOnline(config, args.username);
  if (!online) {
    return { ok: false, reason: `${args.username} is not currently online on the server.` };
  }

  const command = buildUndoCommand(args.times ?? 1);
  const bridgeResult = await sendBridgeCommand(config, args.username, command);
  return {
    commandSent: command,
    ...bridgeResult,
  };
}
