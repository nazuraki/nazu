import { Hono } from 'hono';

import { requireArea, type AppEnv } from '../app.js';
import { createApiKey, deleteApiKey, getApiKey, listApiKeys, setApiKeyRoles } from '../lib/api-keys.js';
import { ValidationError } from '../lib/users.js';

/** API-key management, gated by keys:read / keys:write. */
export function keysRoutes(): Hono<AppEnv> {
	const app = new Hono<AppEnv>();

	app.use('*', requireArea('keys'));

	app.get('/', async (c) => c.json(await listApiKeys()));

	// The plaintext token appears only in this response — store it hashed.
	app.post('/', async (c) => {
		const body = (await c.req.json().catch(() => ({}))) as { name?: string; roleIds?: number[] };
		if (!body.name) return c.json({ error: 'name required' }, 400);
		try {
			const { key, token } = await createApiKey(body.name, body.roleIds ?? []);
			return c.json({ ...key, token }, 201);
		} catch (err) {
			if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
			throw err;
		}
	});

	app.put('/:id/roles', async (c) => {
		const id = Number(c.req.param('id'));
		if (!(await getApiKey(id))) return c.json({ error: 'not found' }, 404);
		const body = (await c.req.json().catch(() => ({}))) as { roleIds?: number[] };
		if (!Array.isArray(body.roleIds)) return c.json({ error: 'roleIds must be an array' }, 400);
		await setApiKeyRoles(id, body.roleIds);
		return c.json(await getApiKey(id));
	});

	app.delete('/:id', async (c) => {
		const deleted = await deleteApiKey(Number(c.req.param('id')));
		if (!deleted) return c.json({ error: 'not found' }, 404);
		return c.json({ ok: true });
	});

	return app;
}
