import { z } from "zod";
import type { Config } from "../config.js";
import { isPlayerOnline } from "../onlineCheck.js";
import { canRequestCode, issueCode } from "../loginCodes.js";
import { sendRconCommand } from "../rcon.js";
import { buildVerificationCodeTellrawCommand } from "../commandBuilder.js";

export const requestLoginCodeSchema = {
  username: z.string().describe("The Minecraft username to verify. They must be online on the server right now."),
};

/**
 * Proves account ownership by whispering a one-time code to the player in-game — only someone
 * actually logged into and playing as that account (the server enforces this via online-mode
 * Mojang auth) can read it. Never returned in the tool result itself.
 */
export async function requestLoginCode(config: Config, args: { username: string }) {
  const online = await isPlayerOnline(config, args.username);
  if (!online) {
    return { ok: false, reason: `${args.username} is not currently online on the server.` };
  }

  const cooldown = canRequestCode(args.username);
  if (!cooldown.ok) {
    return { ok: false, reason: cooldown.reason };
  }

  const code = issueCode(args.username);
  const command = buildVerificationCodeTellrawCommand(args.username, code);
  await sendRconCommand(config, command);

  return {
    ok: true,
    message: `A verification code was sent to ${args.username} in-game. Ask them to read it out and call verify_login_code with it.`,
  };
}
