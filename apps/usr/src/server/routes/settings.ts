import { Hono } from 'hono';

import type { AppEnv } from '../app.js';
import { setLocalCredentials } from '../lib/auth.js';
import { getSection, putSection } from '../lib/settings.js';

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

	app.put('/local-admin', async (c) => {
		const body = (await c.req.json().catch(() => ({}))) as { username?: string; password?: string };
		if (!body.username || !body.password) {
			return c.json({ error: 'username and password required' }, 400);
		}
		await setLocalCredentials(body.username, body.password);
		return c.json({ ok: true });
	});

	return app;
}
