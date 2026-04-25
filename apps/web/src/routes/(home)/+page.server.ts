import { listContainers, type ContainerSummary } from '$lib/server/docker';
import { services } from '$lib/config/services';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	let containers: ContainerSummary[] = [];
	try {
		containers = await listContainers();
	} catch {
		// Docker unavailable in dev
	}
	return { containers, services };
};
