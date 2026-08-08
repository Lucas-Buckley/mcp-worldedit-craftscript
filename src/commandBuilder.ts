/** Quotes a WorldEdit/Brigadier command argument if it contains whitespace or quotes. */
function quoteArg(arg: string): string {
  if (/[\s"]/.test(arg)) {
    return `"${arg.replace(/"/g, '\\"')}"`;
  }
  return arg;
}

function assertSafeUsername(username: string): void {
  // Minecraft usernames: 3-16 chars, letters/digits/underscore. Reject anything else
  // so it can never be used to inject extra tokens into the built command string.
  if (!/^[A-Za-z0-9_]{1,16}$/.test(username)) {
    throw new Error(`Invalid username: ${JSON.stringify(username)}`);
  }
}

function assertSafeScriptName(script: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(script)) {
    throw new Error(`Invalid script name: ${JSON.stringify(script)}`);
  }
}

export function buildRunCraftscriptCommand(username: string, script: string, args: string[]): string {
  assertSafeUsername(username);
  assertSafeScriptName(script);
  const argStr = args.map(quoteArg).join(" ");
  return `execute as ${username} at ${username} run worldedit:cs ${script}${argStr ? " " + argStr : ""}`;
}

export function buildSizeCommand(username: string): string {
  assertSafeUsername(username);
  return `execute as ${username} at ${username} run worldedit:size`;
}

export function buildUndoCommand(username: string, times: number): string {
  assertSafeUsername(username);
  const n = Math.max(1, Math.floor(times));
  return `execute as ${username} at ${username} run worldedit:undo ${n}`;
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
