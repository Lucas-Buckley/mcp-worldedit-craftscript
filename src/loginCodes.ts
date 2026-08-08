import crypto from "node:crypto";

interface PendingCode {
  code: string;
  expiresAt: number;
  attempts: number;
}

const CODE_TTL_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const REQUEST_COOLDOWN_MS = 30 * 1000;

const pendingCodes = new Map<string, PendingCode>();
const lastRequestAt = new Map<string, number>();

export function canRequestCode(username: string): { ok: true } | { ok: false; reason: string } {
  const last = lastRequestAt.get(username.toLowerCase());
  if (last && Date.now() - last < REQUEST_COOLDOWN_MS) {
    const waitSec = Math.ceil((REQUEST_COOLDOWN_MS - (Date.now() - last)) / 1000);
    return { ok: false, reason: `A code was already sent recently. Wait ${waitSec}s before requesting another.` };
  }
  return { ok: true };
}

/** Generates and stores a fresh 6-digit code for a username. Caller is responsible for delivering it in-game. */
export function issueCode(username: string): string {
  const code = crypto.randomInt(100000, 1000000).toString();
  pendingCodes.set(username.toLowerCase(), { code, expiresAt: Date.now() + CODE_TTL_MS, attempts: 0 });
  lastRequestAt.set(username.toLowerCase(), Date.now());
  return code;
}

export function checkCode(username: string, submittedCode: string): { ok: true } | { ok: false; reason: string } {
  const key = username.toLowerCase();
  const pending = pendingCodes.get(key);
  if (!pending) {
    return { ok: false, reason: "No pending code for that username. Call request_login_code first." };
  }
  if (Date.now() > pending.expiresAt) {
    pendingCodes.delete(key);
    return { ok: false, reason: "Code expired. Call request_login_code again." };
  }
  pending.attempts += 1;
  if (pending.attempts > MAX_ATTEMPTS) {
    pendingCodes.delete(key);
    return { ok: false, reason: "Too many incorrect attempts. Call request_login_code again." };
  }
  if (pending.code !== submittedCode.trim()) {
    return { ok: false, reason: "Incorrect code." };
  }
  pendingCodes.delete(key);
  return { ok: true };
}
