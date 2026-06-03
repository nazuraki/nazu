import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT = "nazu-test";
const COMPOSE_FILES = ["-f", "docker-compose.yml", "-f", "docker-compose.test.override.yml"];
// minio and falkordb are core services (no profile). The tls/tunnel ingress
// services aren't exercised by the functional suite, so no profiles are
// activated — keeps caddy/cloudflared (and their host cert mounts) out of CI.
const PROFILES: string[] = [];
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
export const STARTUP_LOG_DIR = join(HERE, ".tmp", "startup");
const SERVICES = ["web", "postgres", "falkordb", "mocks"] as const;

function compose(args: string[]): { status: number; stdout: string; stderr: string } {
	const res = spawnSync("docker", ["compose", "-p", PROJECT, ...COMPOSE_FILES, ...PROFILES, ...args], {
		cwd: REPO_ROOT,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	return {
		status: res.status ?? -1,
		stdout: res.stdout ?? "",
		stderr: res.stderr ?? "",
	};
}

function captureStartupLogs(): void {
	rmSync(STARTUP_LOG_DIR, { recursive: true, force: true });
	mkdirSync(STARTUP_LOG_DIR, { recursive: true });
	for (const svc of SERVICES) {
		const res = compose(["logs", "--no-color", svc]);
		writeFileSync(join(STARTUP_LOG_DIR, `${svc}.log`), res.stdout + res.stderr);
	}
}

export async function setup(): Promise<void> {
	console.log(`[functional] starting stack (project=${PROJECT})`);
	const up = compose(["up", "-d", "--build", "--wait"]);
	if (up.status !== 0) {
		throw new Error(
			`docker compose up failed (exit ${up.status})\n` +
				`--- stdout ---\n${up.stdout}\n` +
				`--- stderr ---\n${up.stderr}`,
		);
	}
	captureStartupLogs();
	console.log("[functional] stack ready");
}

export async function teardown(): Promise<void> {
	console.log("[functional] tearing down stack");
	compose(["down", "-v", "--remove-orphans"]);
}
