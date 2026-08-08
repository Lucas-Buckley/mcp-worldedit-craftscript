import fs from "node:fs";

interface OpEntry {
  name: string;
}

/** Checks whether a username is listed in the server's ops.json. */
export function isOp(opsFile: string, username: string): boolean {
  try {
    const raw = fs.readFileSync(opsFile, "utf-8");
    const ops = JSON.parse(raw) as OpEntry[];
    return ops.some((o) => o.name?.toLowerCase() === username.toLowerCase());
  } catch {
    return false;
  }
}
