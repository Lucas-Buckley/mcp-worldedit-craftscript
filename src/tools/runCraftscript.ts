import { z } from "zod";
import type { Config } from "../config.js";
import { buildRunCraftscriptCommand } from "../commandBuilder.js";
import { sendRconCommand } from "../rcon.js";
import { currentLogOffset, tailLogSince } from "../logTail.js";
import { looksSuccessful } from "../responseParsers.js";

export const runCraftscriptSchema = {
  username: z.string().describe("In-game username of the player to run the script as. Must have an active WorldEdit selection if the script needs one."),
  script: z.string().describe("Bare craftscript name (no .js extension), as it exists in the craftscripts folder."),
  args: z.array(z.string()).optional().default([]).describe("Arguments to pass to the craftscript, in order."),
};

export async function runCraftscript(
  config: Config,
  args: { username: string; script: string; args?: string[] }
) {
  const command = buildRunCraftscriptCommand(args.username, args.script, args.args ?? []);
  const offset = await currentLogOffset(config);
  const rconResponse = await sendRconCommand(config, command);

  let logTail: string | null = null;
  if (rconResponse.trim().length === 0) {
    logTail = await tailLogSince(config, offset, args.username);
  }

  return {
    commandSent: command,
    rconResponse,
    logTail,
    success: looksSuccessful(rconResponse, logTail),
  };
}
