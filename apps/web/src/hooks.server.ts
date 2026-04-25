import type { Handle } from '@sveltejs/kit';
import { getUserFromRequest } from '$lib/auth';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = getUserFromRequest(event.request);
	return resolve(event);
};
