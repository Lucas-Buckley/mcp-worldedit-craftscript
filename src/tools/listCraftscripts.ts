import type { Config } from "../config.js";
import { listCraftscripts as listFiles } from "../craftscriptFs.js";
import { requireAdmin, type Identity } from "../identity.js";

export const listCraftscriptsSchema = {};

export async function listCraftscripts(config: Config, identity: Identity | null) {
  requireAdmin(identity);
  const scripts = await listFiles(config);
  return { scripts };
}
