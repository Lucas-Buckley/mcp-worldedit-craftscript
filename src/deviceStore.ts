import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

export interface DeviceEntry {
  token: string;
  username: string;
  admin: boolean;
  createdAt: string;
}

function readAll(devicesFile: string): DeviceEntry[] {
  const resolved = path.resolve(devicesFile);
  if (!fs.existsSync(resolved)) return [];
  const raw = fs.readFileSync(resolved, "utf-8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as DeviceEntry[]) : [];
}

function writeAll(devicesFile: string, entries: DeviceEntry[]): void {
  fs.writeFileSync(path.resolve(devicesFile), JSON.stringify(entries, null, 2) + "\n", "utf-8");
}

/** Looks up a device by its bearer token. */
export function findDevice(devicesFile: string, token: string): DeviceEntry | undefined {
  return readAll(devicesFile).find((d) => d.token === token);
}

/**
 * Mints and persists a new device token for a verified username. Called once per device,
 * right after they prove control of the account via request_login_code / verify_login_code.
 */
export function createDevice(devicesFile: string, username: string, admin: boolean): DeviceEntry {
  const entry: DeviceEntry = {
    token: crypto.randomBytes(24).toString("base64url"),
    username,
    admin,
    createdAt: new Date().toISOString(),
  };
  const entries = readAll(devicesFile);
  entries.push(entry);
  writeAll(devicesFile, entries);
  return entry;
}
