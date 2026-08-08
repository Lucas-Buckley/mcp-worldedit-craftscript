import { z } from "zod";
import type { Config } from "../config.js";
import { writeCraftscript } from "../craftscriptFs.js";
import { requireAdmin, type Identity } from "../identity.js";

export const injectCraftscriptSchema = {
  filename: z.string().describe("Base filename for the script, e.g. 'ellipse_rings'. '.js' is appended automatically."),
  source: z.string().describe("Full JavaScript (Rhino-dialect) source of the WorldEdit CraftScript."),
  overwrite: z.boolean().optional().default(false).describe("Replace an existing file with the same name."),
};

export async function injectCraftscript(
  config: Config,
  args: { filename: string; source: string; overwrite?: boolean },
  identity: Identity | null
) {
  requireAdmin(identity);

  const result = await writeCraftscript(config, args.filename, args.source, args.overwrite ?? false);
  return {
    ok: true,
    path: result.path,
    bytesWritten: result.bytesWritten,
  };
}
