import type { Config } from "../config.js";
import { listCraftscripts as listFiles } from "../craftscriptFs.js";

export const listCraftscriptsSchema = {};

export async function listCraftscripts(config: Config) {
  const scripts = await listFiles(config);
  return { scripts };
}
