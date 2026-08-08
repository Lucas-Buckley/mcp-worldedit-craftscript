import { z } from "zod";
import type { Config } from "../config.js";
import { isPlayerOnline } from "../onlineCheck.js";
import { checkCode } from "../loginCodes.js";
import { isOp } from "../ops.js";
import { createDevice } from "../deviceStore.js";
import { bindSession } from "../sessionIdentity.js";

export const verifyLoginCodeSchema = {
  username: z.string().describe("The Minecraft username being verified — must match the one passed to request_login_code."),
  code: z.string().describe("The 6-digit code the player read from their in-game chat."),
};

/**
 * Completes verification: binds this chat session to the username immediately, and mints a
 * persistent device token so future sessions/devices don't need to repeat the whisper-code step.
 */
export async function verifyLoginCode(
  config: Config,
  args: { username: string; code: string },
  sessionId: string | undefined
) {
  const online = await isPlayerOnline(config, args.username);
  if (!online) {
    return { ok: false, reason: `${args.username} is not currently online on the server.` };
  }

  const result = checkCode(args.username, args.code);
  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }

  const admin = isOp(config.opsFile, args.username);

  if (sessionId) {
    bindSession(sessionId, { username: args.username, admin });
  }

  const device = createDevice(config.devicesFile, args.username, admin);

  return {
    ok: true,
    username: args.username,
    admin,
    deviceToken: device.token,
    instructions:
      "This chat is now verified. To skip this verification in future sessions/devices, add " +
      `"Authorization: Bearer ${device.token}" as a permanent header in your MCP client config for this server. ` +
      "Keep this token secret — anyone with it can act as this account.",
  };
}
