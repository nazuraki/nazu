import { featureStates } from '$lib/server/settings.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const features = await featureStates();
	const services = features
		.filter((f) => f.enabled)
		.map((f) => ({ name: f.label, href: f.href, description: f.description }));

	// Settings is not a gated feature — always available.
	services.push({ name: 'Settings', href: '/settings', description: 'Configure features and integrations' });

	return { services };
};
