# mcp-worldedit-craftscript

An MCP (Model Context Protocol) server that lets an MCP client (e.g. Claude) write and run
[WorldEdit](https://worldedit.enginehub.org/) CraftScripts against a running Minecraft server,
using a specific player's live selection and undo history — usable remotely by multiple people
without you having to hand out credentials.

It talks to the Minecraft server two ways:
- **RCON**, for player-agnostic things: craftscript file management, and whispering one-time
  verification codes.
- A small companion NeoForge mod, **[weditmcpbridge](https://github.com/Lucas-Buckley/worldedit-mcp-bridge-mod)**, for anything
  that needs to act *as a specific player* (running a craftscript, checking a selection, undoing).

## Why the companion mod is required

The original design tried to do everything over RCON alone, using
`execute as <player> at <player> run ...` to make commands act as a specific player. **This does
not work for WorldEdit.** Confirmed empirically:

- Vanilla `execute as <player>` genuinely does substitute the entity (a `say`/`tell` sent this way
  correctly shows up as coming from that player) — so RCON's entity substitution itself is fine.
- But WorldEdit's `//`-prefixed commands (`//size`, `//undo`, etc.) aren't even registered in
  vanilla's Brigadier command tree — WorldEdit intercepts them via its own chat-handling hook,
  separate from Brigadier entirely. There is no command string RCON can send that reaches them,
  regardless of how the source entity is set.
- Craftscripts (`/cs`, single slash) are similarly unreachable via Brigadier.

`weditmcpbridge` runs inside the same JVM as WorldEdit and dispatches commands through WorldEdit's
**own** pipeline instead: it wraps a real `ServerPlayer` into a WorldEdit `Actor`
(`NeoForgeAdapter.adaptPlayer`) and posts a `CommandEvent` to WorldEdit's own event bus — the exact
path a genuinely typed command takes. WorldEdit then correctly recognizes it as that player, uses
their live selection, and records the edit in their own undo history.

## Two entry points

- **`dist/stdio.js`** — for using Claude on *this same machine* (Claude Desktop's "Local MCP
  servers", or Claude Code's `.mcp.json`). Spawned directly by the client over stdio, fully trusted
  (whoever can launch a process on this machine already controls it), no identity verification.
- **`dist/index.js`** — an HTTPS server for *remote* access (other people, other computers). This is
  where the in-game identity verification below applies.

Use whichever fits — you don't need both, though running the HTTPS one via `run.bat` (for remote
friends) doesn't conflict with also using the stdio one locally. Both talk to the same
`weditmcpbridge` instance for player-scoped actions.

> **Note on Claude Desktop's "Connectors" UI:** that dialog appears to route through Anthropic's
> cloud infrastructure rather than connecting directly from your machine, so it can't reach a
> `127.0.0.1` server no matter what — a `127.0.0.1` there resolves on Anthropic's servers, not
> yours. Use "Local MCP servers" (stdio) for local access instead.

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

Every action that touches the game (`run_craftscript`, `undo`, `get_selection_info`) also
re-checks that the relevant account is currently online, regardless of how identity was
established — so a saved device token can't be used to act as someone while they aren't actually
connected and playing.

## Requirements

- Node.js 20+
- A Minecraft server running WorldEdit 7.3.x, with RCON enabled
- Java 21 + the [weditmcpbridge](https://github.com/Lucas-Buckley/worldedit-mcp-bridge-mod) mod built and installed (see its own
  README) — required for `run_craftscript` / `get_selection_info` / `undo` to work at all

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

### 2. Build and install weditmcpbridge

Follow the [weditmcpbridge README](https://github.com/Lucas-Buckley/worldedit-mcp-bridge-mod), then restart the
Minecraft server again. Confirm `weditmcpbridge listening on 127.0.0.1:25577` appears in the log.

### 3. Install and build this server

```bash
npm install
npm run build
```

### 3b. Local-only use (same machine)

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

Skip straight to "Configure environment variables" below, then you're done; the rest of this
README is about the remote/HTTPS path.

### 4. Configure environment variables

Copy `.env.example` to `.env` and fill in the paths for your server, including `WEDIT_BRIDGE_HOST`/
`WEDIT_BRIDGE_PORT` (defaults `127.0.0.1:25577` — only change if you changed `WEDIT_BRIDGE_PORT` on
the mod side too).

### 4b. TLS (required by some clients, e.g. Claude Desktop)

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

For a certificate trusted by *other people's* devices too (not just this machine), you need a real
CA — see "Making it reachable from another computer" below.

### 5. Run it alongside your Minecraft server

If you added the launch line to your server's `run.bat` (see below), it starts and stops
automatically with the server. Otherwise, run it manually:

```bash
npm start
```

It listens on `http(s)://<MCP_HTTP_HOST>:<MCP_HTTP_PORT>/mcp` (default port `8787`; `https` if
`TLS_CERT_FILE`/`TLS_KEY_FILE` are set).

### 6. Tying it to run.bat

`run.bat` can start this server (minimized, titled `WorldEditMCP`) right before launching the
Minecraft server, and kill it after the Minecraft server process exits:

```bat
start "WorldEditMCP" /min /D "C:\path\to\mcp-worldedit-craftscript" "C:\Program Files\nodejs\node.exe" "dist\index.js"

REM ... your existing java launch line ...

taskkill /FI "WINDOWTITLE eq WorldEditMCP*" /T /F >nul 2>&1
```

### 7. Making it reachable from another computer

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
- Get a stable hostname (e.g. free [DuckDNS](https://duckdns.org)) if your public IP isn't static,
  plus an updater that keeps it current.
- Get a certificate trusted by everyone (not just this machine) via a real CA — e.g.
  [win-acme](https://www.win-acme.com/) + your DDNS provider's DNS-01 validation (if it has an
  update API, like DuckDNS's `txt=` parameter). This avoids needing port 80 open at all. Point
  `TLS_CERT_FILE`/`TLS_KEY_FILE` at the issued chain/key `.pem` files, and set up auto-renewal
  (win-acme registers its own scheduled task — needs to run elevated once) with a post-renewal
  hook that restarts the MCP server process so it picks up the renewed cert.
- Anyone connecting from outside needs the resulting public address plus `:8787/mcp` as their MCP
  server URL — no token needed up front, since they verify via the in-game code flow above the
  first time.

## Tools

| Tool | Auth required | Description |
| --- | --- | --- |
| `request_login_code` | none | Whisper a one-time code to an online player |
| `verify_login_code` | none | Complete verification; returns a persistent device token |
| `run_craftscript` | own username or admin | Run a craftscript as a player (via weditmcpbridge) |
| `get_selection_info` | own username or admin | Check a player's active selection (via weditmcpbridge) |
| `undo` | own username or admin | Undo a player's last N WorldEdit operations (via weditmcpbridge) |
| `inject_craftscript` | admin (server op) | Write a `.js` craftscript into the craftscripts folder (RCON-free, filesystem only) |
| `list_craftscripts` | admin (server op) | List available craftscripts |
| `read_craftscript` | admin (server op) | Read back a craftscript's source |
| `delete_craftscript` | admin (server op) | Delete a craftscript file |

Note: `get_selection_info` can currently only report whether the command succeeded, not the
selection's actual type/size/coordinates — WorldEdit sends that detail straight to the player's
own chat, and the bridge doesn't capture chat text yet. Ask the player to check their own chat, or
have them run `//size` themselves.

## Validating your setup

Confirmed working end-to-end (2026-08-08) with a real player:

1. `//size` via the bridge → real selection info appeared in the player's chat.
2. `/cs <script> <args>` via the bridge → the script actually ran, editing real blocks, with the
   script's own `context.print()` output appearing in the player's chat.
3. The player's own `//undo` correctly reversed a bridge-triggered edit.
4. The `undo` tool (via the bridge) correctly reported "Nothing left to undo" against empty
   history, and successfully reversed a real edit when there was one.

If you're setting this up fresh, re-run this checklist with your own WorldEdit/NeoForge versions —
command registration details (e.g. which literal `//` vs `/` a given command uses) could differ
across WorldEdit versions.

## Security notes

- Non-admin identities can only act as their own verified username; admins (server ops) can act as
  anyone and manage craftscript files.
- `run_craftscript`, `undo`, and `get_selection_info` re-check the target account is currently
  online on every call, even for saved device tokens. Craftscript file management (inject/list/
  read/delete) doesn't require anyone to be online — it has no live gameplay effect until a script
  is actually run.
- Device tokens (`devices.json`) and the RCON password are plaintext secrets — never commit them.
  `devices.json` and `.env` are gitignored.
- `weditmcpbridge`'s TCP endpoint has no authentication of its own and must only ever be bound to
  `127.0.0.1` — anything that can reach it can act as any online player with full WorldEdit access.
  It's protected purely by not being network-reachable; don't change that binding.
- Deleting a craftscript only removes the file; it has no effect on blocks already placed in-game.
- Exposing this to the internet means anyone can attempt `request_login_code` for any username —
  they can't gain access without reading the whispered code in that player's own chat, but it will
  spam a whisper to real players if abused. There's a cooldown per username, but no broader
  rate-limiting.

## License

MIT
