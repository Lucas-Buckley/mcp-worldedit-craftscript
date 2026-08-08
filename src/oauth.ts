import http from "node:http";
import type { Config } from "./config.js";
import { registerClient, findClient, issueAuthCode, consumeAuthCode, verifyPkce } from "./oauthStore.js";
import { canRequestCode, issueCode, checkCode } from "./loginCodes.js";
import { isPlayerOnline } from "./onlineCheck.js";
import { isOp } from "./ops.js";
import { createDevice } from "./deviceStore.js";
import { sendRconCommand } from "./rcon.js";
import { buildVerificationCodeTellrawCommand } from "./commandBuilder.js";

/**
 * Minimal OAuth 2.1 authorization server (RFC 8414 metadata, RFC 7591 dynamic client
 * registration, authorization-code + PKCE grant) so MCP clients that require an OAuth
 * handshake before ever calling /mcp (e.g. Claude Desktop's "Connectors") can connect.
 * The actual "sign in" step reuses the same in-game whisper-code verification as the
 * request_login_code/verify_login_code MCP tools — this is just a browser-facing front end
 * for the same flow, ending in an ordinary device token (the same kind
 * verify_login_code returns, stored the same way in devices.json).
 */

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function parseFormOrJson(contentType: string | undefined, raw: string): Record<string, string> {
  if (contentType?.includes("application/json")) {
    return JSON.parse(raw || "{}");
  }
  const params = new URLSearchParams(raw);
  const result: Record<string, string> = {};
  for (const [key, value] of params) result[key] = value;
  return result;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

function sendHtml(res: http.ServerResponse, status: number, html: string) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function baseUrl(req: http.IncomingMessage): string {
  const proto = (req.socket as unknown as { encrypted?: boolean }).encrypted ? "https" : "http";
  const host = req.headers.host ?? "localhost";
  return `${proto}://${host}`;
}

export function handleWellKnownAuthorizationServer(req: http.IncomingMessage, res: http.ServerResponse): void {
  const origin = baseUrl(req);
  sendJson(res, 200, {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
}

export function handleWellKnownProtectedResource(req: http.IncomingMessage, res: http.ServerResponse): void {
  const origin = baseUrl(req);
  sendJson(res, 200, {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
  });
}

export async function handleRegister(req: http.IncomingMessage, res: http.ServerResponse, config: Config): Promise<void> {
  const raw = await readBody(req);
  let body: any;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    sendJson(res, 400, { error: "invalid_client_metadata" });
    return;
  }

  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  if (redirectUris.length === 0) {
    sendJson(res, 400, { error: "invalid_client_metadata", error_description: "redirect_uris is required" });
    return;
  }

  const client = registerClient(config.oauthClientsFile, redirectUris, body.client_name);
  sendJson(res, 201, {
    client_id: client.clientId,
    redirect_uris: client.redirectUris,
    client_name: client.clientName,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code"],
    response_types: ["code"],
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function authorizePageHtml(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  error?: string;
}): string {
  const { clientId, redirectUri, state, codeChallenge, error } = params;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>worldedit-craftscript — Sign in</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 420px; margin: 60px auto; padding: 0 16px; color: #222; }
  h1 { font-size: 1.2rem; }
  input { width: 100%; padding: 8px; font-size: 1rem; box-sizing: border-box; margin-bottom: 8px; }
  button { padding: 8px 16px; font-size: 1rem; cursor: pointer; }
  .step { display: none; }
  .step.active { display: block; }
  .msg { min-height: 1.2em; margin-top: 8px; }
  .error { color: #b00020; }
  .ok { color: #0a7a2f; }
</style>
</head>
<body>
<h1>Link this device to your Minecraft account</h1>

<div id="step1" class="step active">
  <p>Enter your Minecraft username. You must be online on the server right now.</p>
  <input id="username" placeholder="Minecraft username" autofocus>
  <button id="sendCodeBtn">Send code</button>
  <div id="step1msg" class="msg ${error ? "error" : ""}">${error ? escapeHtml(error) : ""}</div>
</div>

<div id="step2" class="step">
  <p>Check your in-game chat for a whispered code, then enter it here.</p>
  <input id="code" placeholder="6-digit code" inputmode="numeric">
  <button id="verifyBtn">Verify</button>
  <div id="step2msg" class="msg"></div>
</div>

<script>
const clientId = ${JSON.stringify(clientId)};
const redirectUri = ${JSON.stringify(redirectUri)};
const state = ${JSON.stringify(state)};
const codeChallenge = ${JSON.stringify(codeChallenge)};
let username = "";

document.getElementById("sendCodeBtn").onclick = async () => {
  username = document.getElementById("username").value.trim();
  const msg = document.getElementById("step1msg");
  msg.textContent = "Sending...";
  msg.className = "msg";
  try {
    const resp = await fetch("/oauth/authorize/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const data = await resp.json();
    if (!data.ok) {
      msg.textContent = data.reason || "Failed to send code.";
      msg.className = "msg error";
      return;
    }
    msg.textContent = "";
    document.getElementById("step1").classList.remove("active");
    document.getElementById("step2").classList.add("active");
  } catch (e) {
    msg.textContent = "Network error: " + e;
    msg.className = "msg error";
  }
};

document.getElementById("verifyBtn").onclick = async () => {
  const code = document.getElementById("code").value.trim();
  const msg = document.getElementById("step2msg");
  msg.textContent = "Verifying...";
  msg.className = "msg";
  try {
    const resp = await fetch("/oauth/authorize/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, code, clientId, redirectUri, codeChallenge }),
    });
    const data = await resp.json();
    if (!data.ok) {
      msg.textContent = data.reason || "Verification failed.";
      msg.className = "msg error";
      return;
    }
    msg.textContent = "Verified! Redirecting...";
    msg.className = "msg ok";
    const url = new URL(redirectUri);
    url.searchParams.set("code", data.authCode);
    url.searchParams.set("state", state);
    window.location.href = url.toString();
  } catch (e) {
    msg.textContent = "Network error: " + e;
    msg.className = "msg error";
  }
};
</script>
</body>
</html>`;
}

export function handleAuthorizeGet(req: http.IncomingMessage, res: http.ServerResponse, config: Config): void {
  const url = new URL(req.url!, baseUrl(req));
  const clientId = url.searchParams.get("client_id") ?? "";
  const redirectUri = url.searchParams.get("redirect_uri") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const codeChallenge = url.searchParams.get("code_challenge") ?? "";
  const codeChallengeMethod = url.searchParams.get("code_challenge_method") ?? "";

  const client = findClient(config.oauthClientsFile, clientId);
  if (!client || !client.redirectUris.includes(redirectUri)) {
    sendHtml(res, 400, "<p>Invalid client_id or redirect_uri.</p>");
    return;
  }
  if (codeChallengeMethod && codeChallengeMethod !== "S256") {
    sendHtml(res, 400, "<p>Only S256 PKCE is supported.</p>");
    return;
  }

  sendHtml(res, 200, authorizePageHtml({ clientId, redirectUri, state, codeChallenge }));
}

export async function handleAuthorizeSendCode(req: http.IncomingMessage, res: http.ServerResponse, config: Config): Promise<void> {
  const raw = await readBody(req);
  const { username } = JSON.parse(raw || "{}");
  if (!username) {
    sendJson(res, 400, { ok: false, reason: "Missing username." });
    return;
  }

  const online = await isPlayerOnline(config, username);
  if (!online) {
    sendJson(res, 200, { ok: false, reason: `${username} is not currently online on the server.` });
    return;
  }
  const cooldown = canRequestCode(username);
  if (!cooldown.ok) {
    sendJson(res, 200, { ok: false, reason: cooldown.reason });
    return;
  }

  const code = issueCode(username);
  const command = buildVerificationCodeTellrawCommand(username, code);
  await sendRconCommand(config, command);
  sendJson(res, 200, { ok: true });
}

export async function handleAuthorizeComplete(req: http.IncomingMessage, res: http.ServerResponse, config: Config): Promise<void> {
  const raw = await readBody(req);
  const { username, code, clientId, redirectUri, codeChallenge } = JSON.parse(raw || "{}");

  if (!username || !code || !clientId || !redirectUri) {
    sendJson(res, 400, { ok: false, reason: "Missing required fields." });
    return;
  }

  const client = findClient(config.oauthClientsFile, clientId);
  if (!client || !client.redirectUris.includes(redirectUri)) {
    sendJson(res, 400, { ok: false, reason: "Invalid client." });
    return;
  }

  const online = await isPlayerOnline(config, username);
  if (!online) {
    sendJson(res, 200, { ok: false, reason: `${username} is not currently online on the server.` });
    return;
  }

  const result = checkCode(username, code);
  if (!result.ok) {
    sendJson(res, 200, { ok: false, reason: result.reason });
    return;
  }

  const admin = isOp(config.opsFile, username);
  const authCode = issueAuthCode({ clientId, redirectUri, codeChallenge: codeChallenge ?? "", username, admin });
  sendJson(res, 200, { ok: true, authCode });
}

export async function handleToken(req: http.IncomingMessage, res: http.ServerResponse, config: Config): Promise<void> {
  const raw = await readBody(req);
  const body = parseFormOrJson(req.headers["content-type"], raw);

  if (body.grant_type !== "authorization_code") {
    sendJson(res, 400, { error: "unsupported_grant_type" });
    return;
  }

  const entry = consumeAuthCode(body.code ?? "");
  if (!entry) {
    sendJson(res, 400, { error: "invalid_grant", error_description: "Unknown or expired authorization code." });
    return;
  }
  if (entry.clientId !== body.client_id || entry.redirectUri !== body.redirect_uri) {
    sendJson(res, 400, { error: "invalid_grant", error_description: "client_id/redirect_uri mismatch." });
    return;
  }
  if (entry.codeChallenge) {
    if (!body.code_verifier || !verifyPkce(body.code_verifier, entry.codeChallenge)) {
      sendJson(res, 400, { error: "invalid_grant", error_description: "PKCE verification failed." });
      return;
    }
  }

  const device = createDevice(config.devicesFile, entry.username, entry.admin);
  sendJson(res, 200, {
    access_token: device.token,
    token_type: "bearer",
  });
}
