import { randomBytes } from 'node:crypto';

import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

import type { AppEnv, AppOptions } from '../app.js';
import {
	completeSetup,
	createSession,
	deleteSession,
	localAuthConfigured,
	setupRequired,
	verifyLocalCredentials,
} from '../lib/auth.js';
import { authorizeRedirect, completeLogin, configuredProviders, getProvider, OAuthError } from '../lib/oauth.js';
import { usrPermissions } from '../lib/permissions.js';
import { getUserByEmail, updateProfile, ValidationError } from '../lib/users.js';

export const SESSION_COOKIE = 'usr_session';
const STATE_COOKIE = 'usr_oauth_state';

const SESSION_COOKIE_OPTS = {
	httpOnly: true,
	sameSite: 'Lax',
	path: '/',
	maxAge: 30 * 24 * 60 * 60,
} as const;

/** Login endpoints — exempt from the auth gate so the SPA can reach a login. */
export function authRoutes(opts: AppOptions): Hono<AppEnv> {
	const app = new Hono<AppEnv>();

	// Tells the SPA whether/how to render a login screen (or first-run setup).
	app.get('/status', async (c) => {
		const user = c.var.user ?? null;
		return c.json({
			authenticated: user !== null,
			method: user?.method ?? null,
			email: user?.email ?? null,
			usrPermissions: await usrPermissions(user),
			setupRequired: await setupRequired(),
			localAuth: await localAuthConfigured(),
			apiKeyAuth: opts.apiKey !== '',
			oauthProviders: (await configuredProviders()).map((p) => p.name),
		});
	});

	// First-run welcome: create the initial admin user + local credentials.
	// Guarded by setupRequired inside completeSetup — a 400 once configured.
	app.post('/setup', async (c) => {
		const body = (await c.req.json().catch(() => ({}))) as {
			email?: string;
			name?: string;
			username?: string;
			password?: string;
		};
		if (!body.email || !body.username || !body.password) {
			return c.json({ error: 'email, username and password required' }, 400);
		}
		try {
			const userId = await completeSetup({
				email: body.email,
				name: body.name,
				username: body.username,
				password: body.password,
			});
			const token = await createSession(userId);
			setCookie(c, SESSION_COOKIE, token, SESSION_COOKIE_OPTS);
			return c.json({ ok: true }, 201);
		} catch (err) {
			if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
			throw err;
		}
	});

	app.get('/me', async (c) => {
		const user = c.var.user;
		if (!user) return c.json({ error: 'unauthorized' }, 401);
		return c.json({
			id: user.id,
			email: user.email,
			usrPermissions: await usrPermissions(user),
			method: user.method,
		});
	});

	// Local admin login: exchanges credentials for a session cookie.
	app.post('/login', async (c) => {
		const body = (await c.req.json().catch(() => ({}))) as { username?: string; password?: string };
		if (!body.username || !body.password) {
			return c.json({ error: 'username and password required' }, 400);
		}
		const user = await verifyLocalCredentials(body.username, body.password);
		if (!user || user.userId === null) return c.json({ error: 'invalid credentials' }, 401);
		const token = await createSession(user.userId);
		setCookie(c, SESSION_COOKIE, token, SESSION_COOKIE_OPTS);
		return c.json({ ok: true });
	});

	app.post('/logout', async (c) => {
		await deleteSession(getCookie(c, SESSION_COOKIE));
		deleteCookie(c, SESSION_COOKIE, { path: '/' });
		return c.json({ ok: true });
	});

	// OAuth authorization-code flow (GitHub/Google), state carried in a cookie.
	app.get('/oauth/:provider', async (c) => {
		try {
			const provider = await getProvider(c.req.param('provider'));
			const state = randomBytes(16).toString('hex');
			setCookie(c, STATE_COOKIE, state, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 600 });
			return c.redirect(authorizeRedirect(provider, callbackUri(c.req.url, provider.name), state));
		} catch (err) {
			if (err instanceof OAuthError) return c.json({ error: err.message }, 404);
			throw err;
		}
	});

	app.get('/oauth/:provider/callback', async (c) => {
		const state = c.req.query('state');
		const code = c.req.query('code');
		const expected = getCookie(c, STATE_COOKIE);
		deleteCookie(c, STATE_COOKIE, { path: '/' });
		if (!code || !state || !expected || state !== expected) {
			return c.redirect('/?login_error=state');
		}
		try {
			const provider = await getProvider(c.req.param('provider'));
			const identity = await completeLogin(provider, code, callbackUri(c.req.url, provider.name));
			// Only pre-provisioned users may log in — usr is the roster, not a signup page.
			const user = await getUserByEmail(identity.email);
			if (!user) return c.redirect('/?login_error=unknown_user');
			if (!user.name && identity.name) await updateProfile(user.id, { name: identity.name });
			const token = await createSession(user.id);
			setCookie(c, SESSION_COOKIE, token, SESSION_COOKIE_OPTS);
			return c.redirect('/');
		} catch (err) {
			if (err instanceof OAuthError) {
				console.error('[oauth]', err.message);
				return c.redirect('/?login_error=oauth');
			}
			throw err;
		}
	});

	return app;
}

/** The provider redirect_uri: this route's own /callback URL. */
function callbackUri(requestUrl: string, provider: string): string {
	const url = new URL(requestUrl);
	url.pathname = `/api/auth/oauth/${provider}/callback`;
	url.search = '';
	return url.toString();
}
