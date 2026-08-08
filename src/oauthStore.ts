import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

export interface OAuthClient {
  clientId: string;
  redirectUris: string[];
  clientName?: string;
}

interface PendingAuthCode {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  username: string;
  admin: boolean;
  expiresAt: number;
}

const AUTH_CODE_TTL_MS = 5 * 60 * 1000;

function readClients(clientsFile: string): OAuthClient[] {
  const resolved = path.resolve(clientsFile);
  if (!fs.existsSync(resolved)) return [];
  return JSON.parse(fs.readFileSync(resolved, "utf-8")) as OAuthClient[];
}

function writeClients(clientsFile: string, clients: OAuthClient[]): void {
  fs.writeFileSync(path.resolve(clientsFile), JSON.stringify(clients, null, 2) + "\n", "utf-8");
}

/** Dynamic Client Registration (RFC 7591) — public client, no secret (uses PKCE instead). */
export function registerClient(clientsFile: string, redirectUris: string[], clientName?: string): OAuthClient {
  const client: OAuthClient = {
    clientId: crypto.randomBytes(16).toString("base64url"),
    redirectUris,
    clientName,
  };
  const clients = readClients(clientsFile);
  clients.push(client);
  writeClients(clientsFile, clients);
  return client;
}

export function findClient(clientsFile: string, clientId: string): OAuthClient | undefined {
  return readClients(clientsFile).find((c) => c.clientId === clientId);
}

const pendingAuthCodes = new Map<string, PendingAuthCode>();

export function issueAuthCode(entry: Omit<PendingAuthCode, "expiresAt">): string {
  const code = crypto.randomBytes(24).toString("base64url");
  pendingAuthCodes.set(code, { ...entry, expiresAt: Date.now() + AUTH_CODE_TTL_MS });
  return code;
}

/** Consumes (single-use) and returns a pending auth code, or null if missing/expired. */
export function consumeAuthCode(code: string): PendingAuthCode | null {
  const entry = pendingAuthCodes.get(code);
  pendingAuthCodes.delete(code);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry;
}

export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const computed = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  return computed === codeChallenge;
}
