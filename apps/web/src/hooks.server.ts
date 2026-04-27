import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import { handle as authHandle } from './auth';
import { validateCFToken } from '$lib/auth';
import { runMigrations } from '$lib/server/migrate';
import { env } from '$env/dynamic/private';

await runMigrations();

const authFlow: Handle = async ({ event, resolve }) => {
	// Bypass auth in test environment — functional tests hit /api/* directly without credentials
	if (env.NODE_ENV === 'test') {
		event.locals.user = { id: 'test', email: 'test@nazu.local', source: 'oauth' };
		return resolve(event);
	}

	// 1. CF Access JWT (production path — header injected by CF edge)
	const cfUser = await validateCFToken(event.request);
	if (cfUser) {
		event.locals.user = cfUser;
		return resolve(event);
	}

	// 2. OAuth session (local dev / fallback when CF token absent)
	const session = await event.locals.auth();
	if (session?.user?.email) {
		event.locals.user = {
			id: session.user.email,
			email: session.user.email,
			name: session.user.name ?? undefined,
			source: 'oauth',
		};
		return resolve(event);
	}

	// 3. Unauthenticated — redirect to login (except /login and /auth/*)
	const { pathname } = event.url;
	if (!pathname.startsWith('/login') && !pathname.startsWith('/auth')) {
		return Response.redirect(new URL('/login', event.url));
	}

	event.locals.user = null;
	return resolve(event);
};

export const handle = sequence(authHandle, authFlow);
