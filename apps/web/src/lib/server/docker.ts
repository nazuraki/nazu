import Docker from 'dockerode';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

export interface ContainerSummary {
	id: string;
	fullId: string;
	name: string;
	image: string;
	status: string;
	state: string;
	ports: string[];
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
		ports: [
			...new Set(
				c.Ports.filter((p) => p.PublicPort).map(
					(p) => `${p.PublicPort}→${p.PrivatePort}`,
				),
			),
		],
		created: c.Created,
	}));
}

/** Names of compose services that currently have a running container. */
export async function runningComposeServices(): Promise<Set<string>> {
	const raw = await docker.listContainers({ all: false });
	const services = new Set<string>();
	for (const c of raw) {
		const svc = c.Labels?.['com.docker.compose.service'];
		if (svc) services.add(svc);
	}
	return services;
}

export interface StreamLogsOptions {
	tail?: number;
	onLine: (line: string) => void;
	onEnd: () => void;
	onError: (err: unknown) => void;
}

export function streamLogs(id: string, { tail = 200, onLine, onEnd, onError }: StreamLogsOptions): void {
	const container = docker.getContainer(id);

	container
		.logs({ follow: true, stdout: true, stderr: true, tail })
		.then((logStream) => {
			let buf = Buffer.alloc(0);

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
			logStream.on('error', onError);
			return logStream;
		})
		.catch(onError);
}
