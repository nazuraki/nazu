import { randomBytes } from 'node:crypto';

import type { Context } from 'hono';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

import type { AppEnv } from '../app.js';
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
import { mintIdentityToken, safeReturnUrl, SSO_COOKIE, ssoConfig, ssoCookieOpts } from '../lib/sso.js';
import { getUserByEmail, updateProfile, ValidationError } from '../lib/users.js';

export const SESSION_COOKIE = 'usr_session';
const STATE_COOKIE = 'usr_oauth_state';
const RETURN_COOKIE = 'usr_oauth_return';

const SESSION_COOKIE_OPTS = {
	httpOnly: true,
	sameSite: 'Lax',
	path: '/',
	maxAge: 30 * 24 * 60 * 60,
} as const;

/**
 * Establish a browser session: the opaque `usr_session` cookie plus, when SSO
 * is configured, the zone-wide `nz_id` identity JWT.
 */
async function issueSession(c: Context<AppEnv>, userId: number, email: string): Promise<void> {
	const token = await createSession(userId);
	setCookie(c, SESSION_COOKIE, token, SESSION_COOKIE_OPTS);
	await issueSsoCookie(c, email, token);
}

async function issueSsoCookie(c: Context<AppEnv>, email: string, sessionToken: string): Promise<void> {
	const cfg = ssoConfig();
	if (!cfg) return;
	setCookie(c, SSO_COOKIE, await mintIdentityToken(email, sessionToken, cfg), ssoCookieOpts(cfg));
}

function clearSsoCookie(c: Context<AppEnv>): void {
	const cfg = ssoConfig();
	if (cfg) deleteCookie(c, SSO_COOKIE, { path: '/', domain: cfg.cookieDomain });
}

/** Where to send the browser after login: the allow-listed `?return=`, else home. */
function postLoginTarget(raw: string | undefined | null): string {
	const cfg = ssoConfig();
	return (cfg && safeReturnUrl(raw, cfg)) ?? '/';
}

/** Login endpoints — exempt from the auth gate so the SPA can reach a login. */
export function authRoutes(): Hono<AppEnv> {
	const app = new Hono<AppEnv>();

	// Tells the SPA whether/how to render a login screen (or first-run setup).
	app.get('/status', async (c) => {
		const user = c.var.user ?? null;
		const sso = ssoConfig();
		return c.json({
			authenticated: user !== null,
			method: user?.method ?? null,
			email: user?.email ?? null,
			usrPermissions: await usrPermissions(user),
			setupRequired: await setupRequired(),
			localAuth: await localAuthConfigured(),
			oauthProviders: (await configuredProviders()).map((p) => p.name),
			sso: sso ? { cookieDomain: sso.cookieDomain } : null,
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
			await issueSession(c, userId, body.email);
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
		if (!user || user.userId === null || user.email === null) {
			return c.json({ error: 'invalid credentials' }, 401);
		}
		await issueSession(c, user.userId, user.email);
		return c.json({ ok: true });
	});

	app.post('/logout', async (c) => {
		await deleteSession(getCookie(c, SESSION_COOKIE));
		deleteCookie(c, SESSION_COOKIE, { path: '/' });
		clearSsoCookie(c);
		return c.json({ ok: true });
	});

	// SSO refresh: sibling apps bounce here when `nz_id` is missing/expired.
	// A live usr_session re-mints the identity cookie from current grants and
	// returns the browser; otherwise it lands on the login screen, which
	// carries `return` through.
	app.get('/sso/refresh', async (c) => {
		const cfg = ssoConfig();
		if (!cfg) return c.json({ error: 'sso not configured' }, 404);
		const target = safeReturnUrl(c.req.query('return'), cfg) ?? '/';
		const user = c.var.user;
		const sessionToken = getCookie(c, SESSION_COOKIE);
		if (user?.method === 'session' && user.email && sessionToken) {
			await issueSsoCookie(c, user.email, sessionToken);
			return c.redirect(target);
		}
		return c.redirect(`/?return=${encodeURIComponent(target)}`);
	});

	// OAuth authorization-code flow (GitHub/Google), state carried in a cookie.
	app.get('/oauth/:provider', async (c) => {
		try {
			const provider = await getProvider(c.req.param('provider'));
			const state = randomBytes(16).toString('hex');
			setCookie(c, STATE_COOKIE, state, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 600 });
			const ret = postLoginTarget(c.req.query('return'));
			if (ret !== '/') {
				setCookie(c, RETURN_COOKIE, ret, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 600 });
			}
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
		const target = postLoginTarget(getCookie(c, RETURN_COOKIE));
		deleteCookie(c, RETURN_COOKIE, { path: '/' });
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
			await issueSession(c, user.id, user.email);
			return c.redirect(target);
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
