import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { run, type ExecFn } from '../exec.js';
import type { Project } from '../registry.js';

export type LogFn = (line: string) => void;

export interface ComposeServiceStatus {
	service: string;
	name: string;
	image: string;
	state: string;
	status: string;
}

export interface DeployTarget {
	deploy(project: Project, log: LogFn): Promise<void>;
	restart(project: Project, log: LogFn): Promise<void>;
	status(project: Project): Promise<ComposeServiceStatus[]>;
}

interface ComposeTargetOptions {
	/** Root directory holding per-project git checkouts. */
	workdirRoot: string;
	exec?: ExecFn;
}

/**
 * `compose` deploy target: git-sync the project repo into a workdir, then drive
 * `docker compose` against it from outside the managed stack. Git-driven (not
 * container-recreate-in-place) so compose-file changes deploy too.
 */
export class ComposeTarget implements DeployTarget {
	private readonly exec: ExecFn;
	private readonly workdirRoot: string;

	constructor(opts: ComposeTargetOptions) {
		this.workdirRoot = opts.workdirRoot;
		this.exec = opts.exec ?? run;
	}

	workdir(project: Project): string {
		return join(this.workdirRoot, project.name);
	}

	private composeArgs(project: Project): string[] {
		const t = project.target;
		return [
			'compose',
			'-p',
			t.projectName ?? project.name,
			...(t.composeFiles ?? []).flatMap((f) => ['-f', f]),
			...(t.profiles ?? []).flatMap((p) => ['--profile', p]),
		];
	}

	private async syncRepo(project: Project, log: LogFn): Promise<void> {
		const dir = this.workdir(project);
		if (existsSync(join(dir, '.git'))) {
			log(`# git sync ${project.branch}`);
			await this.exec('git', ['fetch', 'origin', project.branch], { cwd: dir, onLine: log });
			await this.exec('git', ['reset', '--hard', `origin/${project.branch}`], {
				cwd: dir,
				onLine: log,
			});
		} else {
			log(`# git clone ${project.gitUrl} (${project.branch})`);
			await this.exec(
				'git',
				['clone', '--branch', project.branch, '--single-branch', project.gitUrl, dir],
				{ onLine: log },
			);
		}
	}

	async deploy(project: Project, log: LogFn): Promise<void> {
		await this.syncRepo(project, log);
		const cwd = this.workdir(project);
		const compose = this.composeArgs(project);
		log('# docker compose pull');
		await this.exec('docker', [...compose, 'pull'], { cwd, onLine: log });
		log('# docker compose up -d');
		await this.exec('docker', [...compose, 'up', '-d', '--remove-orphans'], { cwd, onLine: log });
	}

	async restart(project: Project, log: LogFn): Promise<void> {
		if (!existsSync(join(this.workdir(project), '.git'))) {
			await this.syncRepo(project, log);
		}
		log('# docker compose restart');
		await this.exec('docker', [...this.composeArgs(project), 'restart'], {
			cwd: this.workdir(project),
			onLine: log,
		});
	}

	async status(project: Project): Promise<ComposeServiceStatus[]> {
		if (!existsSync(join(this.workdir(project), '.git'))) return [];
		const { stdout } = await this.exec(
			'docker',
			[...this.composeArgs(project), 'ps', '--all', '--format', 'json'],
			{ cwd: this.workdir(project) },
		);
		return parseComposePs(stdout);
	}
}

/** `docker compose ps --format json` emits NDJSON (one object per line) on v2.21+. */
export function parseComposePs(stdout: string): ComposeServiceStatus[] {
	const trimmed = stdout.trim();
	if (!trimmed) return [];
	const objects: Record<string, unknown>[] = trimmed.startsWith('[')
		? (JSON.parse(trimmed) as Record<string, unknown>[])
		: trimmed
				.split('\n')
				.filter((l) => l.trim())
				.map((l) => JSON.parse(l) as Record<string, unknown>);
	return objects.map((o) => ({
		service: String(o.Service ?? ''),
		name: String(o.Name ?? ''),
		image: String(o.Image ?? ''),
		state: String(o.State ?? ''),
		status: String(o.Status ?? ''),
	}));
}
