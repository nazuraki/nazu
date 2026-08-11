import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

import type { AppDeps } from '../app.js';

export const SESSION_COOKIE = 'backplane_session';

/**
 * Login/logout + admin-account management. `/status` and `/login` are exempt
 * from the auth gate (the SPA needs them to render the login screen); the
 * account endpoints are gated like every other API route.
 */
export function authRoutes(deps: AppDeps): Hono {
	const app = new Hono();
	const { auth } = deps;

	// Open: tells the SPA whether a login screen is needed and which methods apply.
	app.get('/status', (c) => {
		const result = auth.authenticate(c.req.header('authorization'), getCookie(c, SESSION_COOKIE));
		return c.json({
			localAuth: auth.localConfigured(),
			apiKeyAuth: auth.apiKeyConfigured(),
			authenticated: result !== null,
			method: result?.method ?? null,
			username: result?.method === 'session' || result?.method === 'basic' ? result.username : null,
		});
	});

	// Open: exchanges credentials for a session cookie.
	app.post('/login', async (c) => {
		const body = (await c.req.json().catch(() => ({}))) as {
			username?: string;
			password?: string;
		};
		if (!body.username || !body.password) {
			return c.json({ error: 'username and password required' }, 400);
		}
		if (!auth.verifyCredentials(body.username, body.password)) {
			return c.json({ error: 'invalid credentials' }, 401);
		}
		const { token, expiresAt } = auth.createSession(body.username);
		setCookie(c, SESSION_COOKIE, token, {
			httpOnly: true,
			secure: true,
			sameSite: 'Lax',
			path: '/',
			expires: expiresAt,
		});
		return c.json({ ok: true });
	});

	// Open but harmless: revokes only the session presented in the cookie.
	app.post('/logout', (c) => {
		const token = getCookie(c, SESSION_COOKIE);
		if (token) auth.revokeSession(token);
		deleteCookie(c, SESSION_COOKIE, { path: '/' });
		return c.json({ ok: true });
	});

	// Gated (when auth is configured): set or replace the admin account.
	app.put('/account', async (c) => {
		const body = (await c.req.json().catch(() => ({}))) as {
			username?: string;
			password?: string;
		};
		const username = body.username?.trim();
		if (!username || !body.password) {
			return c.json({ error: 'username and password required' }, 400);
		}
		if (body.password.length < 8) {
			return c.json({ error: 'password must be at least 8 characters' }, 400);
		}
		// Replacing credentials revokes every session; mint a fresh one so the
		// caller stays logged in.
		auth.setAccount(username, body.password);
		const { token, expiresAt } = auth.createSession(username);
		setCookie(c, SESSION_COOKIE, token, {
			httpOnly: true,
			secure: true,
			sameSite: 'Lax',
			path: '/',
			expires: expiresAt,
		});
		return c.json({ ok: true });
	});

	// Gated: remove the admin account (back to open mode unless the env key is set).
	app.delete('/account', (c) => {
		auth.clearAccount();
		deleteCookie(c, SESSION_COOKIE, { path: '/' });
		return c.json({ ok: true });
	});

	return app;
}
