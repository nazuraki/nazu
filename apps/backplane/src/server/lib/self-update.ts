import { hostname } from 'node:os';
import { dirname } from 'node:path';

import { run, type ExecFn } from './exec.js';

/** Identity of the running backplane container, read from its compose labels. */
export interface SelfInfo {
	image: string;
	service: string;
	composeProject: string;
	/** Host path of the compose project directory (holds .env). */
	workingDir: string;
	/** Host paths of the compose files. */
	configFiles: string[];
}

/** State of the last self-update helper container. */
export interface HelperStatus {
	state: string;
	exitCode: number | null;
	startedAt: string | null;
	finishedAt: string | null;
	logs: string[];
}

export const HELPER_NAME = 'backplane-self-updater';

/** Self-update can't work here (not in Docker, or not compose-managed). */
export class SelfUpdateUnavailableError extends Error {}
/** A helper container is already running an update. */
export class SelfUpdateInProgressError extends Error {}

const q = (s: string): string => `'${s.replaceAll("'", "'\\''")}'`;

interface InspectedContainer {
	Config: { Image: string; Labels: Record<string, string> | null };
	State: { Status: string; ExitCode: number; StartedAt: string; FinishedAt: string };
}

/**
 * Updates the backplane's own stack. The backplane can't `compose up` itself
 * directly — recreating its own container would kill the compose process mid-
 * update — so `update()` spawns a detached one-shot helper container (running
 * our current image, which ships the docker CLI + compose plugin) that pulls
 * the new image and `up -d`'s the stack from outside. Everything the helper
 * needs (project name, host paths, image) is discovered from the compose
 * labels on our own container, so no extra configuration is required.
 */
export class SelfUpdater {
	private readonly exec: ExecFn;
	private readonly selfId: string;

	constructor(opts: { exec?: ExecFn; selfId?: string } = {}) {
		this.exec = opts.exec ?? run;
		// Under compose the container hostname defaults to the short container id.
		this.selfId = opts.selfId ?? hostname();
	}

	private async inspectContainer(id: string): Promise<InspectedContainer> {
		const { stdout } = await this.exec('docker', ['inspect', id]);
		const [container] = JSON.parse(stdout) as [InspectedContainer];
		return container;
	}

	/** Discover our own image and compose project from the container's labels. */
	async inspect(): Promise<SelfInfo> {
		let container: InspectedContainer;
		try {
			container = await this.inspectContainer(this.selfId);
		} catch {
			throw new SelfUpdateUnavailableError(
				`cannot inspect own container "${this.selfId}" — the backplane is not running in Docker`,
			);
		}
		const labels = container.Config.Labels ?? {};
		const composeProject = labels['com.docker.compose.project'];
		const workingDir = labels['com.docker.compose.project.working_dir'];
		const configFiles = (labels['com.docker.compose.project.config_files'] ?? '')
			.split(',')
			.filter(Boolean);
		if (!composeProject || !workingDir || configFiles.length === 0) {
			throw new SelfUpdateUnavailableError(
				'own container has no compose labels — self-update requires running under docker compose',
			);
		}
		return {
			image: container.Config.Image,
			service: labels['com.docker.compose.service'] ?? 'backplane',
			composeProject,
			workingDir,
			configFiles,
		};
	}

	/** State + log tail of the last helper run, or null if none exists. */
	async helperStatus(): Promise<HelperStatus | null> {
		let container: InspectedContainer;
		try {
			container = await this.inspectContainer(HELPER_NAME);
		} catch {
			return null;
		}
		let logs: string[] = [];
		try {
			const res = await this.exec('docker', ['logs', '--tail', '30', HELPER_NAME]);
			logs = `${res.stdout}\n${res.stderr}`.split('\n').filter(Boolean);
		} catch {
			// Logs are best-effort; the container may vanish between calls.
		}
		const running = container.State.Status === 'running';
		return {
			state: container.State.Status,
			exitCode: running ? null : container.State.ExitCode,
			startedAt: container.State.StartedAt || null,
			finishedAt: running ? null : container.State.FinishedAt || null,
			logs,
		};
	}

	/** Launch the detached helper; resolves as soon as it is started. */
	async update(): Promise<{ helperId: string; info: SelfInfo }> {
		const info = await this.inspect();

		const helper = await this.helperStatus();
		if (helper?.state === 'running') {
			throw new SelfUpdateInProgressError('a self-update is already running');
		}
		if (helper) await this.exec('docker', ['rm', '-f', HELPER_NAME]);

		const compose = [
			'docker compose',
			`-p ${q(info.composeProject)}`,
			`--project-directory ${q(info.workingDir)}`,
			...info.configFiles.map((f) => `-f ${q(f)}`),
		].join(' ');
		// Pull only our own service (matching `just backplane-update`), then up -d:
		// compose recreates just the containers whose image changed.
		const script = `${compose} pull ${q(info.service)} && ${compose} up -d`;

		// Compose paths in the labels are host paths; mount them at identical
		// paths in the helper so the -f/--project-directory args resolve.
		const mounts = new Set<string>([info.workingDir]);
		for (const f of info.configFiles) mounts.add(dirname(f));

		const { stdout } = await this.exec('docker', [
			'run',
			'-d',
			'--name',
			HELPER_NAME,
			'-v',
			'/var/run/docker.sock:/var/run/docker.sock',
			...[...mounts].flatMap((d) => ['-v', `${d}:${d}:ro`]),
			'--entrypoint',
			'sh',
			info.image,
			'-c',
			script,
		]);
		return { helperId: stdout.trim().slice(0, 12), info };
	}
}
