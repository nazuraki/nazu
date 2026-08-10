import { spawn } from 'node:child_process';

export interface ExecOptions {
	cwd?: string;
	env?: Record<string, string>;
	/** Called once per output line (stdout and stderr interleaved). */
	onLine?: (line: string) => void;
	timeoutMs?: number;
}

export interface ExecResult {
	stdout: string;
	stderr: string;
}

export type ExecFn = (cmd: string, args: string[], opts?: ExecOptions) => Promise<ExecResult>;

export class ExecError extends Error {
	constructor(
		cmd: string,
		args: string[],
		public readonly code: number | null,
		public readonly stderr: string,
	) {
		super(`${cmd} ${args.join(' ')} exited ${code}: ${stderr.trim().slice(-500)}`);
		this.name = 'ExecError';
	}
}

/** Spawn a child process, stream its output line-by-line, reject on non-zero exit. */
export const run: ExecFn = (cmd, args, opts = {}) =>
	new Promise((resolve, reject) => {
		const child = spawn(cmd, args, {
			cwd: opts.cwd,
			env: { ...process.env, ...opts.env },
		});

		let stdout = '';
		let stderr = '';
		const pending: Record<'out' | 'err', string> = { out: '', err: '' };

		const feed = (which: 'out' | 'err', chunk: Buffer): void => {
			pending[which] += chunk.toString('utf8');
			let nl: number;
			while ((nl = pending[which].indexOf('\n')) !== -1) {
				const line = pending[which].slice(0, nl);
				pending[which] = pending[which].slice(nl + 1);
				if (line) opts.onLine?.(line);
			}
		};

		child.stdout.on('data', (c: Buffer) => {
			stdout += c.toString('utf8');
			feed('out', c);
		});
		child.stderr.on('data', (c: Buffer) => {
			stderr += c.toString('utf8');
			feed('err', c);
		});

		const timeout = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs ?? 600_000);

		child.on('error', (err) => {
			clearTimeout(timeout);
			reject(err);
		});
		child.on('close', (code) => {
			clearTimeout(timeout);
			for (const which of ['out', 'err'] as const) {
				if (pending[which]) opts.onLine?.(pending[which]);
			}
			if (code === 0) resolve({ stdout, stderr });
			else reject(new ExecError(cmd, args, code, stderr));
		});
	});
