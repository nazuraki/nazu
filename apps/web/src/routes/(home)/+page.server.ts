import { services } from '$lib/config/services';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	return { services };
};
