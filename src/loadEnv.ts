import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Resolve .env relative to this file's location (project root), not process.cwd() —
// stdio-launched MCP clients often spawn this process with an unrelated working directory.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "..", ".env") });
