# mcp-worldedit-craftscript

An MCP (Model Context Protocol) server that lets an MCP client (e.g. Claude) write and run
[WorldEdit](https://worldedit.enginehub.org/) CraftScripts against a running Minecraft server,
using a specific player's live selection and undo history — no companion mod required, and
usable remotely by multiple people without you having to hand out credentials.

It talks to the Minecraft server over **RCON**, using `execute as <player> at <player> run ...` so
WorldEdit commands run in that player's own session: their active selection is used, and the
resulting edit lands in *their* `//undo` history, while this server can also trigger `//undo` on
their behalf.

## Two entry points

- **`dist/stdio.js`** — for using Claude on *this same machine* (Claude Desktop's "Local MCP
  servers", or Claude Code's `.mcp.json`). Spawned directly by the client over stdio, fully trusted
  (whoever can launch a process on this machine already controls it), no identity verification.
- **`dist/index.js`** — an HTTPS server for *remote* access (other people, other computers). This is
  where the in-game identity verification below applies.

Use whichever fits — you don't need both, though running the HTTPS one via `run.bat` (for remote
friends) doesn't conflict with also using the stdio one locally.

> **Note on Claude Desktop's "Connectors" UI:** that dialog appears to route through Anthropic's
> cloud infrastructure rather than connecting directly from your machine, so it can't reach a
> `127.0.0.1` server no matter what — a `127.0.0.1` there resolves on Anthropic's servers, not
> yours. Use "Local MCP servers" (stdio) for local access instead; Connectors may work once this
> server is genuinely internet-reachable (see remote setup below), but that's untested here.

## How identity works (remote/HTTPS mode only)

There's no admin-distributed password or token to hand out. Instead:

1. Someone tells Claude their Minecraft username.
2. Claude calls `request_login_code` — the server checks they're actually online right now, then
   privately whispers them a one-time code in-game (`/tell <player> your code is ...`). Only
   someone actually logged into and playing as that account can see it (the server has
   `online-mode=true`, so Mojang has already verified who that account really is).
3. They read the code out, Claude calls `verify_login_code` with it.
4. That chat session is now authenticated as that player. If the player is listed in the server's
   `ops.json`, they also get admin access (managing craftscript files, acting as any player).
5. `verify_login_code` also returns a **device token** — add it as a permanent
   `Authorization: Bearer <token>` header in that device's MCP client config, and future sessions
   skip the whisper-code step entirely. Verification is a one-time thing per device, not per chat.

Every action that touches the game (`run_craftscript`, `undo`, `get_selection_info`, and the
craftscript file-management tools) also re-checks that the relevant account is currently online,
regardless of how identity was established — so a saved device token can't be used to act as
someone while they aren't actually connected and playing.

## Requirements

- Node.js 20+
- A Minecraft server running WorldEdit, with RCON enabled

## Setup

### 1. Enable RCON on your Minecraft server

In your server's `server.properties`:

```
enable-rcon=true
rcon.password=<a strong random password>
```

`rcon.port` defaults to `25575`. **Restart the server** — these settings are only read at startup.
RCON itself only needs to be reachable from the machine running this MCP server (typically the same
machine), not from the internet — don't forward `rcon.port` through your router.

### 2. Install and build this server

```bash
npm install
npm run build
```

### 2b. Local-only use (same machine)

Add it to Claude Desktop's **Local MCP servers** (Settings → Developer → Edit Config) or Claude
Code's `.mcp.json`:

```json
{
  "mcpServers": {
    "worldedit-craftscript-local": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\path\\to\\mcp-worldedit-craftscript\\dist\\stdio.js"]
    }
  }
}
```

No `.env`/TLS/RCON-exposure concerns beyond the base RCON setup below — this path never opens a
network port. Skip straight to "Enable RCON" (step 1) and "Configure environment variables" (step
3), then you're done; the rest of this README is about the remote/HTTPS path.

### 3. Configure environment variables

Copy `.env.example` to `.env` and fill in the paths for your server. See the table in
`.env.example` for what each variable does — the key ones are `RCON_PASSWORD`, `CRAFTSCRIPTS_DIR`,
`OPS_FILE`, and `MCP_HTTP_HOST`/`MCP_HTTP_PORT`.

### 3b. TLS (required by some clients, e.g. Claude Desktop)

Some MCP clients only accept `https://` URLs for custom connectors, even for `127.0.0.1`. Generate
a certificate trusted by this machine using [mkcert](https://github.com/FiloSottile/mkcert):

```bash
mkcert -install   # one-time: adds a local CA to your OS trust store — run this yourself
mkdir certs
mkcert -cert-file certs/localhost-cert.pem -key-file certs/localhost-key.pem 127.0.0.1 localhost
```

Then set `TLS_CERT_FILE`/`TLS_KEY_FILE` in `.env` to those paths. Leave both unset to serve plain
HTTP instead (fine for clients that accept `http://`, or when reverse-proxying TLS elsewhere).
`mkcert -install` modifies your system's trust store, so run it yourself rather than scripting it.

### 4. Run it alongside your Minecraft server

If you added the launch line to your server's `run.bat` (see below), it starts and stops
automatically with the server. Otherwise, run it manually:

```bash
npm start
```

It listens on `http(s)://<MCP_HTTP_HOST>:<MCP_HTTP_PORT>/mcp` (default port `8787`; `https` if
`TLS_CERT_FILE`/`TLS_KEY_FILE` are set).

### 5. Tying it to run.bat

`run.bat` can start this server (minimized, titled `WorldEditMCP`) right before launching the
Minecraft server, and kill it after the Minecraft server process exits:

```bat
start "WorldEditMCP" /min /D "C:\path\to\mcp-worldedit-craftscript" "C:\Program Files\nodejs\node.exe" "dist\index.js"

REM ... your existing java launch line ...

taskkill /FI "WINDOWTITLE eq WorldEditMCP*" /T /F >nul 2>&1
```

### 6. Making it reachable from another computer

**Same machine only:** set `MCP_HTTP_HOST=127.0.0.1` and skip the rest of this section.

**Over the internet:**
- Keep `MCP_HTTP_HOST=0.0.0.0` so it accepts connections from your router, not just localhost.
- **Open a Windows Firewall inbound rule** for `MCP_HTTP_PORT` yourself (this changes a security
  setting, so it's not something this project does for you):
  ```powershell
  New-NetFirewallRule -DisplayName "WorldEdit MCP" -Direction Inbound -Protocol TCP -LocalPort 8787 -Action Allow
  ```
- **Forward that port on your router** to this machine's LAN IP (router UI, not something scriptable
  from here).
- Anyone connecting from outside needs the resulting public address (your public IP or a dynamic-DNS
  hostname) plus `:8787/mcp` as their MCP server URL — no token needed up front, since they verify
  via the in-game code flow above the first time.
- This exposes an HTTP(S) endpoint to the internet. It requires identity verification for anything
  that touches the game, but there's no rate-limiting beyond what's built in.
- **The mkcert certificate above only makes this machine trust itself** — it won't be trusted by
  other people's devices, since mkcert's CA is local to this machine. Friends connecting remotely
  will get a certificate warning/rejection with that setup. For a cert trusted by everyone, you need
  one from a real CA (e.g. [Let's Encrypt](https://letsencrypt.org/)) tied to a domain/DDNS hostname
  pointing at your public IP — a bigger step than local-only setup, and out of scope of this README.
  Until then, remote users may need to accept a cert warning, or you can run this without TLS and
  put a separate HTTPS-terminating reverse proxy in front of it.

## Tools

| Tool | Auth required | Description |
| --- | --- | --- |
| `request_login_code` | none | Whisper a one-time code to an online player |
| `verify_login_code` | none | Complete verification; returns a persistent device token |
| `run_craftscript` | own username or admin | Run a craftscript as a player |
| `get_selection_info` | own username or admin | Check a player's active selection |
| `undo` | own username or admin | Undo a player's last N WorldEdit operations |
| `inject_craftscript` | admin (server op) | Write a `.js` craftscript into the craftscripts folder |
| `list_craftscripts` | admin (server op) | List available craftscripts |
| `read_craftscript` | admin (server op) | Read back a craftscript's source |
| `delete_craftscript` | admin (server op) | Delete a craftscript file |

## Validating your setup

Before relying on this for real, confirm with a real player online:

1. Basic RCON connectivity (e.g. send `list`).
2. `execute as <player> run say hi` shows as `<player>: hi` in-game, not `Server: hi`, when sent via RCON.
3. Call `request_login_code` for that player, confirm they receive the whisper, then `verify_login_code`.
4. Have the player make a selection and confirm it with their own `/size`; then call `get_selection_info`
   for that username and confirm the results match.
5. Inject a trivial test script (as an op), run it via `run_craftscript`, and confirm the edit lands.
6. Have the player type `//undo` themselves after an MCP-triggered edit — it should undo it. Then test
   the `undo` tool the same way.

If selection or undo scoping doesn't match (step 4 or 6 fails), `execute as` over RCON likely isn't
carrying WorldEdit session context on your setup, and this approach won't work without a companion mod.

## Security notes

- Non-admin identities can only act as their own verified username; admins (server ops) can act as
  anyone and manage craftscript files.
- `run_craftscript`, `undo`, and `get_selection_info` re-check the target account is currently
  online on every call, even for saved device tokens. Craftscript file management (inject/list/
  read/delete) doesn't require anyone to be online — it has no live gameplay effect until a script
  is actually run.
- Device tokens (`devices.json`) and the RCON password are plaintext secrets — never commit them.
  `devices.json` and `.env` are gitignored.
- Deleting a craftscript only removes the file; it has no effect on blocks already placed in-game.
- Exposing this to the internet means anyone can attempt `request_login_code` for any username —
  they can't gain access without reading the whispered code in that player's own chat, but it will
  spam a whisper to real players if abused. There's a cooldown per username, but no broader
  rate-limiting or TLS.

## License

MIT
