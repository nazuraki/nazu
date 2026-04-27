import type { Handle } from '@sveltejs/kit';
import { getUserFromRequest } from '$lib/auth';
import { runMigrations } from '$lib/server/migrate';

await runMigrations();

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = getUserFromRequest(event.request);
	return resolve(event);
};
