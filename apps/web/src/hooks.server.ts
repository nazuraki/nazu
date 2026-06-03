import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import { handle as authHandle } from './auth';
import {
	validateCFToken,
	validateBasicAuth,
	localAuthConfigured,
	oauthConfigured,
	localUser,
} from '$lib/auth';
import { runMigrations } from '$lib/server/migrate';
import { env } from '$env/dynamic/private';

await runMigrations();

const authFlow: Handle = async ({ event, resolve }) => {
	// Bypass auth in test environment — functional tests hit /api/* directly without credentials
	if (env.NODE_ENV === 'test') {
		event.locals.user = { id: 'test', email: 'test@nazu.local', source: 'oauth' };
		return resolve(event);
	}

	// 1. CF Access JWT (header injected by CF edge — gates tunnel/remote access).
	const cfUser = await validateCFToken(event.request);
	if (cfUser) {
		event.locals.user = cfUser;
		return resolve(event);
	}

	// 2. OAuth session (only when a provider is configured — event.locals.auth
	//    exists only when authHandle is in the sequence, see below).
	if (oauthConfigured()) {
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
	}

	// 3. Local admin credentials via HTTP Basic (zero-dependency LAN gate).
	if (localAuthConfigured()) {
		const basicUser = validateBasicAuth(event.request);
		if (basicUser) {
			event.locals.user = basicUser;
			return resolve(event);
		}
	}

	// 4. Request is unauthenticated. Which gate applies depends on what's
	//    configured. CF Access only protects the tunnel, so it never blocks LAN
	//    access on its own — only OAuth or local credentials gate the LAN.
	if (oauthConfigured()) {
		// Interactive login UI takes precedence (works with OAuth callbacks).
		const { pathname } = event.url;
		if (!pathname.startsWith('/login') && !pathname.startsWith('/auth')) {
			return Response.redirect(new URL('/login', event.url));
		}
		event.locals.user = null;
		return resolve(event);
	}
	if (localAuthConfigured()) {
		// No valid Basic credentials — challenge.
		return new Response('Authentication required', {
			status: 401,
			headers: { 'WWW-Authenticate': 'Basic realm="nazu", charset="UTF-8"' },
		});
	}

	// 5. Zero-conf: no LAN auth method configured — open, with a local identity.
	event.locals.user = localUser();
	return resolve(event);
};

// Auth.js (authHandle) requires AUTH_SECRET and throws MissingSecret if it runs
// without one. Only mount it when an OAuth provider is actually configured — in
// zero-conf / Basic-auth modes it's neither needed nor configured.
export const handle = oauthConfigured() ? sequence(authHandle, authFlow) : authFlow;
