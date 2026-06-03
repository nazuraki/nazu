import { runningComposeServices } from '$lib/server/docker.js';
import { listServiceStates } from '$lib/server/services.js';
import { listSettings, featureStates } from '$lib/server/settings.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const running = await runningComposeServices();
	return {
		services: await listServiceStates(running),
		sections: await listSettings(),
		features: await featureStates(),
	};
};
