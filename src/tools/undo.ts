import { z } from "zod";
import type { Config } from "../config.js";
import { buildUndoCommand } from "../commandBuilder.js";
import { sendRconCommand } from "../rcon.js";
import { looksSuccessful } from "../responseParsers.js";

export const undoSchema = {
  username: z.string().describe("In-game username of the player whose WorldEdit history to undo from."),
  times: z.number().int().positive().optional().default(1).describe("Number of operations to undo."),
};

export async function undo(config: Config, args: { username: string; times?: number }) {
  const command = buildUndoCommand(args.username, args.times ?? 1);
  const rconResponse = await sendRconCommand(config, command);
  return {
    commandSent: command,
    rconResponse,
    success: looksSuccessful(rconResponse, null),
  };
}
