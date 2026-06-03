import { SvelteKitAuth } from '@auth/sveltekit';
import GitHub from '@auth/sveltekit/providers/github';
import Google from '@auth/sveltekit/providers/google';
import { error, type Handle, type RequestEvent } from '@sveltejs/kit';
import { getSection } from '$lib/server/settings.js';

type AuthInstance = ReturnType<typeof SvelteKitAuth>;

// Auth.js is constructed lazily from DB-backed config rather than at module
// load, so OAuth providers can be configured in the UI and applied on the next
// request (no container restart, no env vars). The instance is rebuilt only
// when the relevant config changes.
let cached: { sig: string; instance: AuthInstance } | null = null;

async function getAuth(): Promise<AuthInstance | null> {
	const o = await getSection('oauth');
	const githubId = (o.githubId as string)?.trim();
	const githubSecret = (o.githubSecret as string)?.trim();
	const googleId = (o.googleId as string)?.trim();
	const googleSecret = (o.googleSecret as string)?.trim();

	const providers = [];
	if (githubId && githubSecret) providers.push(GitHub({ clientId: githubId, clientSecret: githubSecret }));
	if (googleId && googleSecret) providers.push(Google({ clientId: googleId, clientSecret: googleSecret }));
	if (providers.length === 0) return null;

	const secret = o.authSecret as string;
	const sig = JSON.stringify([githubId, githubSecret, googleId, googleSecret, secret]);
	if (cached?.sig === sig) return cached.instance;

	// trustHost: required when running behind a reverse proxy (Caddy / CF Tunnel).
	const instance = SvelteKitAuth({ providers, secret, trustHost: true });
	cached = { sig, instance };
	return instance;
}

/** Handle that delegates to Auth.js when OAuth is configured, else a no-op. */
export const handle: Handle = async ({ event, resolve }) => {
	const auth = await getAuth();
	if (!auth) return resolve(event);
	return auth.handle({ event, resolve });
};

export async function signIn(event: RequestEvent) {
	const auth = await getAuth();
	if (!auth) throw error(404, 'OAuth is not configured');
	return auth.signIn(event);
}

export async function signOut(event: RequestEvent) {
	const auth = await getAuth();
	if (!auth) throw error(404, 'OAuth is not configured');
	return auth.signOut(event);
}
