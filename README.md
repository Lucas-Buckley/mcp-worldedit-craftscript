# mcp-worldedit-craftscript

An MCP (Model Context Protocol) server that lets an MCP client (e.g. Claude) write and run
[WorldEdit](https://worldedit.enginehub.org/) CraftScripts against a running Minecraft server,
using a specific player's live selection and undo history — no companion mod required.

It works by talking to the server over **RCON** and using `execute as <player> at <player> run ...`
so that WorldEdit commands run in that player's own session: their active selection is used, and
the resulting edit lands in *their* `//undo` history (they can undo it themselves in-game), while
this server can also trigger `//undo` on their behalf.

## How it works

- Craftscript files are written directly into your server's `config/worldedit/craftscripts/` folder.
- Running a script, checking a selection, and undoing are all dispatched as Minecraft commands over
  RCON, wrapped in `execute as <username> at <username> run ...` so WorldEdit resolves the correct
  player session.
- If WorldEdit's feedback isn't captured in the RCON response itself, the server falls back to
  tailing the live server log file for a short window.

This design's one unverified assumption is that `execute as <player> ... run worldedit:...` over RCON
actually carries WorldEdit's session context (selection + undo history) for that player, rather than
running as console. Validate this against your own server (see "Validating your setup" below) before
relying on it.

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

`rcon.port` defaults to `25575` and doesn't need to change unless it conflicts with something else.
**Restart the server** — these settings are only read at startup.

> RCON authenticates with a plaintext password over the wire (that's how the Source RCON protocol
> works — there's no hashing/salting scheme to add on top of it). Keep RCON bound to `127.0.0.1`
> (the default) unless you specifically need remote access, and never commit your `rcon.password` or
> `RCON_PASSWORD` anywhere.

### 2. Install and build this server

```bash
npm install
npm run build
```

### 3. Configure environment variables

Copy `.env.example` to `.env` for local testing, or (recommended for actual use) set these directly
in your MCP client's server config `env` block:

| Variable | Description |
| --- | --- |
| `RCON_HOST` | RCON host, default `127.0.0.1` |
| `RCON_PORT` | RCON port, default `25575` |
| `RCON_PASSWORD` | Must match `rcon.password` in `server.properties` |
| `CRAFTSCRIPTS_DIR` | Absolute path to `config/worldedit/craftscripts` on your server |
| `SERVER_LOG_PATH` | Absolute path to the server's live log file (fallback output channel) |
| `RCON_TIMEOUT_MS` | Optional, default `5000` |
| `LOG_TAIL_TIMEOUT_MS` | Optional, default `3000` |

### 4. Add it to your MCP client config

```json
{
  "mcpServers": {
    "worldedit-craftscript": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-worldedit-craftscript/dist/index.js"],
      "env": {
        "RCON_HOST": "127.0.0.1",
        "RCON_PORT": "25575",
        "RCON_PASSWORD": "your-rcon-password",
        "CRAFTSCRIPTS_DIR": "/absolute/path/to/server/config/worldedit/craftscripts",
        "SERVER_LOG_PATH": "/absolute/path/to/server/logs/latest.log"
      }
    }
  }
}
```

## Tools

| Tool | Description |
| --- | --- |
| `inject_craftscript` | Write a `.js` craftscript into the craftscripts folder |
| `list_craftscripts` | List available craftscripts |
| `read_craftscript` | Read back a craftscript's source |
| `delete_craftscript` | Delete a craftscript file |
| `run_craftscript` | Run a craftscript as a given player (uses their selection + history) |
| `get_selection_info` | Check a player's active selection (type/size/volume, not exact coordinates) |
| `undo` | Undo a player's last N WorldEdit operations |

## Validating your setup

Before relying on this for real, confirm with a real player online:

1. Basic RCON connectivity (e.g. send `list`).
2. `execute as <player> run say hi` shows as `<player>: hi` in-game, not `Server: hi`, when sent via RCON.
3. Have the player make a selection and confirm it with their own `/size`; then call `get_selection_info`
   for that username and confirm the results match.
4. Inject a trivial test script, run it via `run_craftscript`, and confirm the edit actually lands.
5. Have the player type `//undo` themselves after an MCP-triggered edit — it should undo it. Then test
   the `undo` tool the same way.

If selection or undo scoping doesn't match (step 3 or 5 fails), `execute as` over RCON likely isn't
carrying WorldEdit session context on your setup, and this approach won't work without a companion mod.

## Security notes

- Any tool call can act "as" any player username with no allowlist. Fine for a single-admin/local
  server; don't point this at a shared server without adding one.
- The RCON password is plaintext by protocol design — keep it out of version control and prefer
  loopback-only RCON.
- Deleting a craftscript only removes the file; it has no effect on blocks already placed in-game.

## License

MIT
