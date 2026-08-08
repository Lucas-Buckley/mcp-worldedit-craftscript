import type { Identity } from "./identity.js";

/** In-memory binding from an MCP transport session ID to a verified identity. */
const sessionIdentities = new Map<string, Identity>();

export function bindSession(sessionId: string, identity: Identity): void {
  sessionIdentities.set(sessionId, identity);
}

export function getSessionIdentity(sessionId: string | undefined): Identity | null {
  if (!sessionId) return null;
  return sessionIdentities.get(sessionId) ?? null;
}

export function unbindSession(sessionId: string): void {
  sessionIdentities.delete(sessionId);
}
