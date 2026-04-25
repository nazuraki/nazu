import http from 'node:http';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

interface DockerApiContainer {
	Id: string;
	Names: string[];
	Image: string;
	State: string;
	Status: string;
}

function fetchDockerContainers(): Promise<DockerApiContainer[]> {
	return new Promise((resolve, reject) => {
		const req = http.get(
			{ socketPath: '/var/run/docker.sock', path: '/containers/json?all=1' },
			(res) => {
				let data = '';
				res.on('data', (chunk) => (data += chunk));
				res.on('end', () => {
					try {
						resolve(JSON.parse(data) as DockerApiContainer[]);
					} catch {
						reject(new Error('Failed to parse Docker API response'));
					}
				});
			}
		);
		req.on('error', reject);
	});
}

export async function GET() {
	const allowlist = env.DOCKER_CONTAINERS
		? env.DOCKER_CONTAINERS.split(',').map((s) => s.trim()).filter(Boolean)
		: [];

	try {
		const raw = await fetchDockerContainers();
		const containers = raw
			.map((c) => ({
				id: c.Id,
				name: c.Names[0]?.replace(/^\//, '') ?? c.Image,
				state: c.State,
				status: c.Status,
			}))
			.filter((c) => allowlist.length === 0 || allowlist.includes(c.name))
			.sort((a, b) => a.name.localeCompare(b.name));
		return json(containers);
	} catch {
		return json([], { status: 200 });
	}
}
