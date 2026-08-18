import { Hono } from 'hono';

import type { AppEnv } from '../app.js';
import { listUserRoles } from '../lib/roles.js';
import { getUser, updateProfile, NotFoundError, type ProfileInput } from '../lib/users.js';

/** Self-service profile — only sessions backed by a users row have one. */
export function profileRoutes(): Hono<AppEnv> {
	const app = new Hono<AppEnv>();

	app.get('/', async (c) => {
		const { userId } = c.var.user;
		if (userId === null) return c.json({ error: 'no profile for this identity' }, 404);
		const user = await getUser(userId);
		if (!user) return c.json({ error: 'not found' }, 404);
		return c.json({ ...user, roles: await listUserRoles(userId) });
	});

	app.patch('/', async (c) => {
		const { userId } = c.var.user;
		if (userId === null) return c.json({ error: 'no profile for this identity' }, 404);
		const body = (await c.req.json().catch(() => ({}))) as ProfileInput;
		try {
			return c.json(await updateProfile(userId, body));
		} catch (err) {
			if (err instanceof NotFoundError) return c.json({ error: err.message }, 404);
			throw err;
		}
	});

	return app;
}
