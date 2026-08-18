import { Hono } from 'hono';

import type { AppEnv } from '../app.js';
import { setLocalCredentials } from '../lib/auth.js';
import { getSection, putSection } from '../lib/settings.js';
import { ValidationError } from '../lib/users.js';

/** Admin-only config: OAuth provider credentials + the local admin account. */
export function settingsRoutes(): Hono<AppEnv> {
	const app = new Hono<AppEnv>();

	app.use('*', async (c, next) => {
		if (!c.var.user.admin) return c.json({ error: 'admin required' }, 403);
		return next();
	});

	// Secrets are write-only: the response reports presence, never the value.
	app.get('/oauth', async (c) => {
		const o = await getSection('oauth');
		return c.json({
			githubId: o.githubId ?? '',
			githubSecretSet: Boolean(o.githubSecret),
			googleId: o.googleId ?? '',
			googleSecretSet: Boolean(o.googleSecret),
		});
	});

	app.put('/oauth', async (c) => {
		const body = (await c.req.json().catch(() => ({}))) as Record<string, string>;
		const values: Record<string, string> = {};
		for (const key of ['githubId', 'githubSecret', 'googleId', 'googleSecret']) {
			if (typeof body[key] === 'string') values[key] = body[key];
		}
		await putSection('oauth', values);
		return c.json({ ok: true });
	});

	// The credentials must link to an existing user (their profile/roles row);
	// omitting email keeps the current linkage.
	app.put('/local-admin', async (c) => {
		const body = (await c.req.json().catch(() => ({}))) as {
			username?: string;
			password?: string;
			email?: string;
		};
		if (!body.username || !body.password) {
			return c.json({ error: 'username and password required' }, 400);
		}
		const email = body.email?.trim() || (await getSection('auth')).localEmail;
		if (!email) return c.json({ error: 'email required to link the credentials to a user' }, 400);
		try {
			await setLocalCredentials(body.username, body.password, email);
		} catch (err) {
			if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
			throw err;
		}
		return c.json({ ok: true });
	});

	return app;
}
