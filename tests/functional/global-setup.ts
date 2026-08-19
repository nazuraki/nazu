import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, sql } from "./lib/db.js";

const PROJECT = "nazu-test";
const COMPOSE_FILES = ["-f", "docker-compose.yml", "-f", "docker-compose.test.override.yml"];
// minio and falkordb are core services (no profile). The optional sidecars
// (graph, discord) aren't exercised by the functional suite, so no profiles
// are activated.
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

// App config now lives in the DB (app_settings), not env. Seed the GitHub
// section the repo-view tests rely on, pointing at the mock GitHub server.
async function seedSettings(): Promise<void> {
	const github = {
		user: "testuser",
		org: "testorg",
		personalToken: "test-personal-token",
		orgToken: "test-org-token",
		apiBaseUrl: "http://mocks:8080/github",
	};
	const s = sql();
	// The web container creates app_settings during its startup migration; retry
	// until that has happened.
	const deadline = Date.now() + 60_000;
	for (;;) {
		try {
			await s`
				INSERT INTO app_settings (section, config)
				VALUES ('github', ${s.json(github)})
				ON CONFLICT (section) DO UPDATE SET config = ${s.json(github)}
			`;
			return;
		} catch (err) {
			if (Date.now() > deadline) throw err;
			await new Promise((r) => setTimeout(r, 1000));
		}
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
	await seedSettings();
	await closeDb();
	console.log("[functional] stack ready");
}

export async function teardown(): Promise<void> {
	console.log("[functional] tearing down stack");
	compose(["down", "-v", "--remove-orphans"]);
}
