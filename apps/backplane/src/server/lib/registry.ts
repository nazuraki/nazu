import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface ComposeTargetConfig {
	type: 'compose';
	/** Compose project name (`-p`); defaults to the backplane project name. */
	projectName?: string;
	/** Compose files relative to the repo checkout root. */
	composeFiles?: string[];
	/** Compose profiles to activate. */
	profiles?: string[];
}

export type TargetConfig = ComposeTargetConfig;

export interface Project {
	name: string;
	gitUrl: string;
	branch: string;
	/** Image refs to poll for updates, e.g. `ghcr.io/nazuraki/nazu-web:latest`. */
	images: string[];
	target: TargetConfig;
	/** Deploy automatically when the digest poller sees a new image. */
	autoDeploy: boolean;
	createdAt: string;
}

export type ProjectInput = Omit<Project, 'createdAt'>;

export type DeployTrigger = 'manual' | 'webhook' | 'poll';
export type DeployStatus = 'running' | 'succeeded' | 'failed';
export type DeployAction = 'deploy' | 'update' | 'restart';

export interface DeployRecord {
	id: number;
	project: string;
	action: DeployAction;
	trigger: DeployTrigger;
	status: DeployStatus;
	log: string;
	startedAt: string;
	finishedAt: string | null;
}

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export class ValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ValidationError';
	}
}

interface ProjectRow {
	name: string;
	git_url: string;
	branch: string;
	images: string;
	target: string;
	auto_deploy: number;
	created_at: string;
}

interface DeployRow {
	id: number;
	project: string;
	action: string;
	trigger: string;
	status: string;
	log: string;
	started_at: string;
	finished_at: string | null;
}

/** Project registry + deploy history, backed by SQLite (node:sqlite, zero-dep). */
export class Registry {
	private db: DatabaseSync;

	constructor(path: string) {
		if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
		this.db = new DatabaseSync(path);
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS projects (
				name TEXT PRIMARY KEY,
				git_url TEXT NOT NULL,
				branch TEXT NOT NULL,
				images TEXT NOT NULL,
				target TEXT NOT NULL,
				auto_deploy INTEGER NOT NULL DEFAULT 0,
				created_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS deploys (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				project TEXT NOT NULL,
				action TEXT NOT NULL,
				trigger TEXT NOT NULL,
				status TEXT NOT NULL,
				log TEXT NOT NULL DEFAULT '',
				started_at TEXT NOT NULL,
				finished_at TEXT
			);
			CREATE INDEX IF NOT EXISTS deploys_project ON deploys (project, id DESC);
			CREATE TABLE IF NOT EXISTS settings (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			);
			-- Browser sessions moved to usr SSO; drop the local table and its
			-- orphaned auth.* settings from earlier installs.
			DROP TABLE IF EXISTS sessions;
			DELETE FROM settings WHERE key IN ('auth.localUser', 'auth.localPassword');
		`);
	}

	// ── Settings (generic key/value) ──────────────────────────────────────────

	getSetting(key: string): string | undefined {
		const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
			| { value: string }
			| undefined;
		return row?.value;
	}

	setSetting(key: string, value: string): void {
		this.db
			.prepare(
				`INSERT INTO settings (key, value) VALUES (?, ?)
				 ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
			)
			.run(key, value);
	}

	deleteSetting(key: string): void {
		this.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
	}

	// ── Projects ──────────────────────────────────────────────────────────────

	listProjects(): Project[] {
		const rows = this.db.prepare('SELECT * FROM projects ORDER BY name').all() as unknown as ProjectRow[];
		return rows.map(toProject);
	}

	getProject(name: string): Project | undefined {
		const row = this.db.prepare('SELECT * FROM projects WHERE name = ?').get(name) as
			| ProjectRow
			| undefined;
		return row ? toProject(row) : undefined;
	}

	/** Create or replace a project definition. */
	saveProject(input: ProjectInput): Project {
		validate(input);
		const existing = this.getProject(input.name);
		const createdAt = existing?.createdAt ?? new Date().toISOString();
		this.db
			.prepare(
				`INSERT INTO projects (name, git_url, branch, images, target, auto_deploy, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT (name) DO UPDATE SET
				   git_url = excluded.git_url, branch = excluded.branch, images = excluded.images,
				   target = excluded.target, auto_deploy = excluded.auto_deploy`,
			)
			.run(
				input.name,
				input.gitUrl,
				input.branch,
				JSON.stringify(input.images),
				JSON.stringify(input.target),
				input.autoDeploy ? 1 : 0,
				createdAt,
			);
		return { ...input, createdAt };
	}

	deleteProject(name: string): boolean {
		const res = this.db.prepare('DELETE FROM projects WHERE name = ?').run(name);
		return res.changes > 0;
	}

	createDeploy(project: string, action: DeployAction, trigger: DeployTrigger): DeployRecord {
		const startedAt = new Date().toISOString();
		const res = this.db
			.prepare(
				`INSERT INTO deploys (project, action, trigger, status, started_at) VALUES (?, ?, ?, 'running', ?)`,
			)
			.run(project, action, trigger, startedAt);
		return {
			id: Number(res.lastInsertRowid),
			project,
			action,
			trigger,
			status: 'running',
			log: '',
			startedAt,
			finishedAt: null,
		};
	}

	appendDeployLog(id: number, line: string): void {
		this.db.prepare(`UPDATE deploys SET log = log || ? WHERE id = ?`).run(line + '\n', id);
	}

	finishDeploy(id: number, status: Exclude<DeployStatus, 'running'>): void {
		this.db
			.prepare(`UPDATE deploys SET status = ?, finished_at = ? WHERE id = ?`)
			.run(status, new Date().toISOString(), id);
	}

	getDeploy(id: number): DeployRecord | undefined {
		const row = this.db.prepare('SELECT * FROM deploys WHERE id = ?').get(id) as
			| DeployRow
			| undefined;
		return row ? toDeploy(row) : undefined;
	}

	listDeploys(project: string, limit = 20): DeployRecord[] {
		const rows = this.db
			.prepare('SELECT * FROM deploys WHERE project = ? ORDER BY id DESC LIMIT ?')
			.all(project, limit) as unknown as DeployRow[];
		return rows.map(toDeploy);
	}

	close(): void {
		this.db.close();
	}
}

function validate(input: ProjectInput): void {
	if (!NAME_RE.test(input.name)) {
		throw new ValidationError(
			`invalid project name "${input.name}" (lowercase letters, digits, hyphens; max 64 chars)`,
		);
	}
	if (!input.gitUrl?.trim()) throw new ValidationError('gitUrl is required');
	if (!input.branch?.trim()) throw new ValidationError('branch is required');
	if (!Array.isArray(input.images)) throw new ValidationError('images must be an array');
	if (input.target?.type !== 'compose') {
		throw new ValidationError(`unsupported deploy target type "${input.target?.type}"`);
	}
}

function toProject(row: ProjectRow): Project {
	return {
		name: row.name,
		gitUrl: row.git_url,
		branch: row.branch,
		images: JSON.parse(row.images) as string[],
		target: JSON.parse(row.target) as TargetConfig,
		autoDeploy: row.auto_deploy === 1,
		createdAt: row.created_at,
	};
}

function toDeploy(row: DeployRow): DeployRecord {
	return {
		id: row.id,
		project: row.project,
		action: row.action as DeployAction,
		trigger: row.trigger as DeployTrigger,
		status: row.status as DeployStatus,
		log: row.log,
		startedAt: row.started_at,
		finishedAt: row.finished_at,
	};
}
