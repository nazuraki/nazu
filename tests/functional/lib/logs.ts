import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const STARTUP_LOG_DIR = join(HERE, "..", ".tmp", "startup");

export function readStartupLogs(service: string): string {
	return readFileSync(join(STARTUP_LOG_DIR, `${service}.log`), "utf8");
}
