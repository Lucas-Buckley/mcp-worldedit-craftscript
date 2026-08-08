/** Quotes a WorldEdit/Brigadier command argument if it contains whitespace or quotes. */
function quoteArg(arg: string): string {
  if (/[\s"]/.test(arg)) {
    return `"${arg.replace(/"/g, '\\"')}"`;
  }
  return arg;
}

// Minecraft usernames: 3-16 chars, letters/digits/underscore. Reject anything else so it can
// never be used to inject extra tokens into a built command string (RCON) or JSON payload (bridge).
export function assertSafeUsername(username: string): void {
  if (!/^[A-Za-z0-9_]{1,16}$/.test(username)) {
    throw new Error(`Invalid username: ${JSON.stringify(username)}`);
  }
}

function assertSafeScriptName(script: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(script)) {
    throw new Error(`Invalid script name: ${JSON.stringify(script)}`);
  }
}

// WorldEdit's "//"-prefixed commands are NOT registered in vanilla's Brigadier command tree —
// they're intercepted via WorldEdit's own chat-handling hook, entirely separate from Brigadier.
// Neither RCON's "execute as <player>" nor a genuine player-derived Brigadier CommandSourceStack
// can reach them (confirmed empirically; a bare "size" literal even collided with an unrelated
// mod's command). These strings are sent to the weditmcpbridge mod's local TCP endpoint, which
// posts a real com.sk89q.worldedit.event.platform.CommandEvent to WorldEdit's own event bus using
// an Actor adapted from the real ServerPlayer — the same path a genuine typed "//" command takes.
// See the project README for the full investigation. RCON is still used for the player-agnostic
// file-management tools and for the request_login_code whisper.

// Craftscripts specifically use a single-slash "/cs" invocation, unlike the double-slash
// region-editing commands (//size, //undo, etc.) — confirmed empirically.
export function buildCraftscriptCommand(script: string, args: string[]): string {
  assertSafeScriptName(script);
  const argStr = args.map(quoteArg).join(" ");
  return `/cs ${script}${argStr ? " " + argStr : ""}`;
}

export function buildSizeCommand(): string {
  return "//size";
}

export function buildUndoCommand(times: number): string {
  const n = Math.max(1, Math.floor(times));
  return `//undo ${n}`;
}

export function buildTellCommand(username: string, message: string): string {
  assertSafeUsername(username);
  // `tell` consumes the rest of the line as the message, so no quoting — just strip
  // anything that could be read as a line break or otherwise escape the message argument.
  const safeMessage = message.replace(/[\r\n]/g, " ");
  return `tell ${username} ${safeMessage}`;
}

export function buildListCommand(): string {
  return "list";
}
