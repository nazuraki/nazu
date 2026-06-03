import { json, error } from '@sveltejs/kit';
import { runningComposeServices } from '$lib/server/docker.js';
import { enableService, disableService, listServiceStates } from '$lib/server/services.js';

export async function GET() {
	const running = await runningComposeServices();
	return json(await listServiceStates(running));
}

export async function POST({ request }) {
	const body = await request.json();
	const profile = (body.profile ?? '').trim();
	if (!profile) throw error(400, 'profile required');
	if (typeof body.enabled !== 'boolean') throw error(400, 'enabled (boolean) required');

	try {
		if (body.enabled) {
			await enableService(profile);
		} else {
			await disableService(profile);
		}
	} catch (e) {
		throw error(400, e instanceof Error ? e.message : 'failed to update service');
	}

	const running = await runningComposeServices();
	return json(await listServiceStates(running));
}
