import { z } from "zod";
import type { Config } from "../config.js";
import { deleteCraftscript as removeFile } from "../craftscriptFs.js";
import { requireAdmin, type Identity } from "../identity.js";
import { isPlayerOnline } from "../onlineCheck.js";

export const deleteCraftscriptSchema = {
  filename: z.string().describe("Script filename to delete, with or without the .js extension."),
};

/**
 * Destructive but low-stakes: removes a script file only, no in-game effect.
 * Callers (Claude) should confirm with the user in chat before invoking this.
 */
export async function deleteCraftscript(config: Config, args: { filename: string }, identity: Identity | null) {
  requireAdmin(identity);

  const online = await isPlayerOnline(config, identity!.username);
  if (!online) {
    return { ok: false, reason: `${identity!.username} is not currently online on the server.` };
  }

  await removeFile(config, args.filename);
  return { ok: true, filename: args.filename };
}
