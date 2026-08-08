import { z } from "zod";
import type { Config } from "../config.js";
import { buildSizeCommand } from "../commandBuilder.js";
import { sendRconCommand } from "../rcon.js";
import { parseSizeResponse } from "../responseParsers.js";
import { requireUsernameScope, type Identity } from "../identity.js";
import { isPlayerOnline } from "../onlineCheck.js";

export const getSelectionInfoSchema = {
  username: z.string().describe("In-game username of the player whose active WorldEdit selection to inspect."),
};

/**
 * Reports selection type/size/volume only. Exact min/max coordinates are not
 * obtainable this way — WorldEdit's //size output doesn't include them, and
 * there's no other RCON-safe way to read them without a companion mod.
 */
export async function getSelectionInfo(config: Config, args: { username: string }, identity: Identity | null) {
  requireUsernameScope(identity, args.username);

  const online = await isPlayerOnline(config, args.username);
  if (!online) {
    return { ok: false, reason: `${args.username} is not currently online on the server.` };
  }

  const command = buildSizeCommand(args.username);
  const rconResponse = await sendRconCommand(config, command);
  return parseSizeResponse(rconResponse);
}
