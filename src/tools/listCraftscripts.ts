import type { Config } from "../config.js";
import { listCraftscripts as listFiles } from "../craftscriptFs.js";
import { requireAdmin, type Identity } from "../identity.js";
import { isPlayerOnline } from "../onlineCheck.js";

export const listCraftscriptsSchema = {};

export async function listCraftscripts(config: Config, identity: Identity | null) {
  requireAdmin(identity);

  const online = await isPlayerOnline(config, identity!.username);
  if (!online) {
    return { ok: false, reason: `${identity!.username} is not currently online on the server.` };
  }

  const scripts = await listFiles(config);
  return { scripts };
}
