import fs from "node:fs/promises";
import path from "node:path";
import type { Config } from "./config.js";

export class CraftscriptFsError extends Error {}

/** Validates a bare script name and resolves it to an absolute .js path inside CRAFTSCRIPTS_DIR. */
function resolveScriptPath(config: Config, filename: string): string {
  const base = filename.endsWith(".js") ? filename.slice(0, -3) : filename;
  if (!/^[A-Za-z0-9_-]+$/.test(base)) {
    throw new CraftscriptFsError(
      `Invalid filename ${JSON.stringify(filename)}. Use letters, digits, underscore, and hyphen only.`
    );
  }
  const resolved = path.resolve(config.craftscriptsDir, `${base}.js`);
  if (path.dirname(resolved) !== config.craftscriptsDir) {
    throw new CraftscriptFsError(`Filename ${JSON.stringify(filename)} resolves outside the craftscripts directory.`);
  }
  return resolved;
}

export async function writeCraftscript(
  config: Config,
  filename: string,
  source: string,
  overwrite: boolean
): Promise<{ path: string; bytesWritten: number }> {
  const target = resolveScriptPath(config, filename);

  if (!overwrite) {
    try {
      await fs.access(target);
      throw new CraftscriptFsError(
        `${path.basename(target)} already exists. Pass overwrite: true to replace it.`
      );
    } catch (err) {
      if (err instanceof CraftscriptFsError) throw err;
      // ENOENT is expected here — file doesn't exist yet, proceed.
    }
  }

  await fs.mkdir(config.craftscriptsDir, { recursive: true });
  await fs.writeFile(target, source, "utf-8");
  const bytesWritten = Buffer.byteLength(source, "utf-8");
  return { path: target, bytesWritten };
}

export async function readCraftscript(config: Config, filename: string): Promise<{ filename: string; source: string }> {
  const target = resolveScriptPath(config, filename);
  try {
    const source = await fs.readFile(target, "utf-8");
    return { filename: path.basename(target), source };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CraftscriptFsError(`Craftscript ${JSON.stringify(filename)} not found.`);
    }
    throw err;
  }
}

export async function deleteCraftscript(config: Config, filename: string): Promise<void> {
  const target = resolveScriptPath(config, filename);
  try {
    await fs.unlink(target);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CraftscriptFsError(`Craftscript ${JSON.stringify(filename)} not found.`);
    }
    throw err;
  }
}

export interface CraftscriptInfo {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
}

export async function listCraftscripts(config: Config): Promise<CraftscriptInfo[]> {
  await fs.mkdir(config.craftscriptsDir, { recursive: true });
  const entries = await fs.readdir(config.craftscriptsDir, { withFileTypes: true });
  const jsFiles = entries.filter((e) => e.isFile() && e.name.endsWith(".js"));

  const infos = await Promise.all(
    jsFiles.map(async (entry) => {
      const stat = await fs.stat(path.join(config.craftscriptsDir, entry.name));
      return {
        name: entry.name,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
    })
  );

  return infos.sort((a, b) => a.name.localeCompare(b.name));
}
