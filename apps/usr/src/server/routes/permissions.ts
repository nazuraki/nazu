import { Hono } from 'hono';

import { requireArea, type AppEnv } from '../app.js';
import { resolvePermissions } from '../lib/permissions.js';

/**
 * The hot path other apps call, gated by permissions:read (the seeded
 * usr/service role grants exactly this — assign it to app API keys):
 *   GET /api/permissions?email=…&app=…  → grants for one app
 *   GET /api/permissions?email=…        → grants keyed by app
 * Unknown emails are 200 + exists:false, not an error.
 */
export function permissionsRoutes(): Hono<AppEnv> {
	const app = new Hono<AppEnv>();

	app.use('*', requireArea('permissions'));

	app.get('/', async (c) => {
		const email = c.req.query('email');
		const appName = c.req.query('app');
		if (!email) return c.json({ error: 'email required' }, 400);

		const result = await resolvePermissions(email, appName);
		if (appName) {
			const grants = result.apps[appName] ?? { roles: [], permissions: [] };
			return c.json({ email: result.email, app: appName, exists: result.exists, ...grants });
		}
		return c.json(result);
	});

	return app;
}
