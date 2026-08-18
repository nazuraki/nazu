import { Hono } from 'hono';

import type { AppEnv } from '../app.js';
import { resolvePermissions } from '../lib/permissions.js';

/**
 * The hot path other apps call (API-key authed in practice):
 *   GET /api/permissions?email=…&app=…  → grants for one app
 *   GET /api/permissions?email=…        → grants keyed by app
 * Unknown emails are 200 + exists:false, not an error.
 */
export function permissionsRoutes(): Hono<AppEnv> {
	const app = new Hono<AppEnv>();

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
