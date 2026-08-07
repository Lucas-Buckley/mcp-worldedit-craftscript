import { z } from "zod";
import type { Config } from "../config.js";
import { readCraftscript as readFile } from "../craftscriptFs.js";

export const readCraftscriptSchema = {
  filename: z.string().describe("Script filename, with or without the .js extension."),
};

export async function readCraftscript(config: Config, args: { filename: string }) {
  return readFile(config, args.filename);
}
