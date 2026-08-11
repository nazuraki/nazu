import Docker from 'dockerode';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

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

