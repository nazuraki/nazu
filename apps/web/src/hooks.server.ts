import { sequence } from '@sveltejs/kit/hooks';
import { error, type Handle } from '@sveltejs/kit';
import { handle as authHandle } from './auth';
import {
	validateCFToken,
	validateBasicAuth,
	localAuthConfigured,
	oauthConfigured,
	localUser,
} from '$lib/auth';
import { validateApiKey, parseApiKeys } from '$lib/server/api-key';
import { featureForPath } from '$lib/config/settings';
import { isFeatureEnabled } from '$lib/server/settings';
import { runMigrations } from '$lib/server/migrate';
import { env } from '$env/dynamic/private';

await runMigrations();

const authFlow: Handle = async ({ event, resolve }) => {
	// Bypass auth in test environment — functional tests hit /api/* directly without credentials
	if (env.NODE_ENV === 'test') {
		event.locals.user = { id: 'test', email: 'test@nazu.local', source: 'oauth' };
		return resolve(event);
	}

	// 0. Static API key (non-interactive agents / MCP). Header-based, checked
	//    before the interactive methods so programmatic calls never hit the
	//    /login redirect or a Basic-auth challenge. Off unless NAZU_API_KEY is set.
	const apiUser = validateApiKey(event.request, parseApiKeys(env.NAZU_API_KEY));
	if (apiUser) {
		event.locals.user = apiUser;
		return resolve(event);
	}

	// 1. CF Access JWT (header injected by CF edge — gates tunnel/remote access).
	const cfUser = await validateCFToken(event.request);
	if (cfUser) {
		event.locals.user = cfUser;
		return resolve(event);
	}

	// 2. OAuth session (only when a provider is configured — event.locals.auth
	//    is populated by authHandle, which no-ops when OAuth is unconfigured).
	if (await oauthConfigured()) {
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
	if (await localAuthConfigured()) {
		const basicUser = await validateBasicAuth(event.request);
		if (basicUser) {
			event.locals.user = basicUser;
			return resolve(event);
		}
	}

	// 4. Request is unauthenticated. Which gate applies depends on what's
	//    configured. CF Access only protects the tunnel, so it never blocks LAN
	//    access on its own — only OAuth or local credentials gate the LAN.
	if (await oauthConfigured()) {
		// Interactive login UI takes precedence (works with OAuth callbacks).
		const { pathname } = event.url;
		if (!pathname.startsWith('/login') && !pathname.startsWith('/auth')) {
			return Response.redirect(new URL('/login', event.url));
		}
		event.locals.user = null;
		return resolve(event);
	}
	if (await localAuthConfigured()) {
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

// Gate app features: a request to a disabled feature's route (or its API)
// returns 404, as if the feature did not exist.
const featureGate: Handle = async ({ event, resolve }) => {
	const feature = featureForPath(event.url.pathname);
	if (feature && !(await isFeatureEnabled(feature.key))) {
		throw error(404, 'Not found');
	}
	return resolve(event);
};

export const handle = sequence(authHandle, authFlow, featureGate);
