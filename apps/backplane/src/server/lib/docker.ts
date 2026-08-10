import Docker from 'dockerode';

import { imageRepoKey } from './updates.js';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

export interface ContainerSummary {
	id: string;
	fullId: string;
	name: string;
	image: string;
	status: string;
	state: string;
	composeProject: string | null;
	composeService: string | null;
	created: number;
}

export async function listContainers(): Promise<ContainerSummary[]> {
	const raw = await docker.listContainers({ all: true });
	return raw.map((c) => ({
		id: c.Id.slice(0, 12),
		fullId: c.Id,
		name: c.Names[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12),
		image: c.Image,
		status: c.Status,
		state: c.State,
		composeProject: c.Labels?.['com.docker.compose.project'] ?? null,
		composeService: c.Labels?.['com.docker.compose.service'] ?? null,
		created: c.Created,
	}));
}

/**
 * Map of normalized `host/repo` → manifest digest for every image backing a
 * running container (from the image's RepoDigests). Feeds update detection.
 */
export async function runningImageDigests(): Promise<Map<string, string>> {
	const containers = await docker.listContainers({ all: false });
	const digests = new Map<string, string>();
	const seen = new Set<string>();
	for (const c of containers) {
		if (seen.has(c.ImageID)) continue;
		seen.add(c.ImageID);
		try {
			const info = await docker.getImage(c.ImageID).inspect();
			for (const repoDigest of info.RepoDigests ?? []) {
				const at = repoDigest.lastIndexOf('@');
				if (at === -1) continue;
				digests.set(imageRepoKey(repoDigest.slice(0, at)), repoDigest.slice(at + 1));
			}
		} catch {
			// Image may have been removed between list and inspect; skip.
		}
	}
	return digests;
}

/** Demultiplex docker's 8-byte-framed log stream into lines. */
export function demuxLogBuffer(buf: Buffer): string[] {
	const lines: string[] = [];
	let rest = buf;
	while (rest.length >= 8) {
		const frameSize = rest.readUInt32BE(4);
		if (rest.length < 8 + frameSize) break;
		const payload = rest.subarray(8, 8 + frameSize).toString('utf8');
		rest = rest.subarray(8 + frameSize);
		for (const line of payload.split('\n')) {
			if (line) lines.push(line);
		}
	}
	return lines;
}

/** Last `tail` log lines of a container, one-shot. */
export async function logsTail(id: string, tail = 200): Promise<string[]> {
	const buf = (await docker.getContainer(id).logs({
		follow: false,
		stdout: true,
		stderr: true,
		tail,
	})) as unknown as Buffer;
	return demuxLogBuffer(buf);
}

export interface StreamLogsOptions {
	tail?: number;
	onLine: (line: string) => void;
	onEnd: () => void;
	onError: (err: unknown) => void;
	signal?: AbortSignal;
}

/** Follow a container's logs, invoking `onLine` per line until aborted or ended. */
export function streamLogs(
	id: string,
	{ tail = 200, onLine, onEnd, onError, signal }: StreamLogsOptions,
): void {
	docker
		.getContainer(id)
		.logs({ follow: true, stdout: true, stderr: true, tail })
		.then((raw) => {
			// dockerode types this as a web ReadableStream, but with follow:true it
			// is a Node stream at runtime.
			const logStream = raw as unknown as NodeJS.ReadableStream & { destroy(): void };
			let buf = Buffer.alloc(0);

			signal?.addEventListener('abort', () => logStream.destroy());

			logStream.on('data', (chunk: Buffer) => {
				buf = Buffer.concat([buf, chunk]);
				while (buf.length >= 8) {
					const frameSize = buf.readUInt32BE(4);
					if (buf.length < 8 + frameSize) break;
					const payload = buf.subarray(8, 8 + frameSize).toString('utf8');
					buf = buf.subarray(8 + frameSize);
					for (const line of payload.split('\n')) {
						if (line) onLine(line);
					}
				}
			});

			logStream.on('end', onEnd);
			logStream.on('close', onEnd);
			logStream.on('error', onError);
			return logStream;
		})
		.catch(onError);
}
