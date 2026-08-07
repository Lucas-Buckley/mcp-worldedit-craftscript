export interface SelectionInfo {
  hasSelection: boolean;
  type: string | null;
  sizeX: number | null;
  sizeY: number | null;
  sizeZ: number | null;
  blockCount: number | null;
  raw: string;
}

/**
 * Parses WorldEdit's `//size` command output. The exact field set/wording
 * has not been empirically confirmed against the installed 7.3.8 build over
 * RCON (see plan's validation section) — this is a best-effort parse of the
 * commonly documented format, and always keeps `raw` so callers/Claude can
 * fall back to reading the text directly if a field doesn't match.
 */
export function parseSizeResponse(raw: string): SelectionInfo {
  const text = raw.trim();

  if (text.length === 0 || /no selection|make a selection|incomplete region/i.test(text)) {
    return { hasSelection: false, type: null, sizeX: null, sizeY: null, sizeZ: null, blockCount: null, raw };
  }

  const typeMatch = text.match(/Type:\s*(\w+)/i);
  const sizeMatch = text.match(/Size:\s*(\d+)\s*x\s*(\d+)\s*x\s*(\d+)/i);
  const countMatch = text.match(/(?:#\s*of\s*blocks|Block count|Volume):\s*([\d,]+)/i);

  return {
    hasSelection: true,
    type: typeMatch ? typeMatch[1] : null,
    sizeX: sizeMatch ? Number(sizeMatch[1]) : null,
    sizeY: sizeMatch ? Number(sizeMatch[2]) : null,
    sizeZ: sizeMatch ? Number(sizeMatch[3]) : null,
    blockCount: countMatch ? Number(countMatch[1].replace(/,/g, "")) : null,
    raw,
  };
}

/** Heuristic success check: no exception/error markers found in the combined output. */
export function looksSuccessful(rconResponse: string, logTail: string | null): boolean {
  const combined = `${rconResponse}\n${logTail ?? ""}`;
  return !/error|exception|unknown command|not found|failed/i.test(combined);
}
