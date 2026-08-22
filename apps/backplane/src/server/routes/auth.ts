import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';

import type { AppDeps } from '../app.js';
import { SSO_COOKIE } from '../lib/sso.js';

/**
 * Auth status for the SPA. Sign-in itself happens in usr (the SPA bounces the
 * browser to usr's SSO refresh endpoint); the backplane only reports what the
 * current request resolves to and where to go when it doesn't.
 */
export function authRoutes(deps: AppDeps): Hono {
	const app = new Hono();
	const { auth } = deps;

	// Open: tells the SPA whether it must sign in (and where), or lacks access.
	app.get('/status', async (c) => {
		const ssoToken = getCookie(c, SSO_COOKIE);
		const result = await auth.authenticate(c.req.header('authorization'), ssoToken);
		// A valid cookie without a backplane grant is "known but denied" — the
		// SPA shows who is signed in instead of bouncing to usr again.
		const identity = result?.identity ?? (await auth.sso?.verify(ssoToken)) ?? null;
		const returnTo = c.req.query('return');
		return c.json({
			apiKeyAuth: auth.apiKeyConfigured(),
			sso: auth.sso
				? {
						usrUrl: auth.sso.config.usrUrl,
						app: auth.sso.config.app,
						refreshUrl: returnTo ? auth.sso.refreshUrl(returnTo) : null,
					}
				: null,
			authenticated: result !== null,
			method: result?.method ?? null,
			username: result?.method === 'sso' ? result.username : null,
			identity,
		});
	});

	return app;
}
