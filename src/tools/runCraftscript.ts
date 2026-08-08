import { z } from "zod";
import type { Config } from "../config.js";
import { assertSafeUsername, buildCraftscriptCommand } from "../commandBuilder.js";
import { sendBridgeCommand } from "../bridgeClient.js";
import { currentLogOffset, tailLogSince } from "../logTail.js";
import { requireUsernameScope, type Identity } from "../identity.js";
import { isPlayerOnline } from "../onlineCheck.js";

export const runCraftscriptSchema = {
  username: z.string().describe("In-game username of the player to run the script as. Must have an active WorldEdit selection if the script needs one."),
  script: z.string().describe("Bare craftscript name (no .js extension), as it exists in the craftscripts folder."),
  args: z.array(z.string()).optional().default([]).describe("Arguments to pass to the craftscript, in order."),
};

export async function runCraftscript(
  config: Config,
  args: { username: string; script: string; args?: string[] },
  identity: Identity | null
) {
  requireUsernameScope(identity, args.username);
  assertSafeUsername(args.username);

  const online = await isPlayerOnline(config, args.username);
  if (!online) {
    return { ok: false, reason: `${args.username} is not currently online on the server.` };
  }

  const command = buildCraftscriptCommand(args.script, args.args ?? []);
  const offset = await currentLogOffset(config);
  const bridgeResult = await sendBridgeCommand(config, args.username, command);

  let logTail: string | null = null;
  if (bridgeResult.ok) {
    logTail = await tailLogSince(config, offset, args.username);
  }

  return {
    commandSent: command,
    bridgeResult,
    logTail,
    success: bridgeResult.ok,
  };
}
