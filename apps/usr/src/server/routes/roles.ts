import { Hono } from 'hono';

import type { AppEnv } from '../app.js';
import { createRole, deleteRole, getRole, listRoles, updateRole, type RoleInput } from '../lib/roles.js';
import { NotFoundError, ValidationError } from '../lib/users.js';

/** Admin CRUD for app-scoped roles and their permission sets. */
export function rolesRoutes(): Hono<AppEnv> {
	const app = new Hono<AppEnv>();

	app.use('*', async (c, next) => {
		if (!c.var.user.admin) return c.json({ error: 'admin required' }, 403);
		return next();
	});

	app.get('/', async (c) => c.json(await listRoles(c.req.query('app'))));

	app.post('/', async (c) => {
		const body = (await c.req.json().catch(() => ({}))) as RoleInput;
		try {
			return c.json(await createRole({ ...body, permissions: body.permissions ?? [] }), 201);
		} catch (err) {
			if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
			throw err;
		}
	});

	app.patch('/:id', async (c) => {
		const id = Number(c.req.param('id'));
		const existing = await getRole(id);
		if (!existing) return c.json({ error: 'not found' }, 404);
		const body = (await c.req.json().catch(() => ({}))) as Partial<RoleInput>;
		try {
			return c.json(
				await updateRole(id, {
					app: body.app ?? existing.app,
					name: body.name ?? existing.name,
					description: body.description !== undefined ? body.description : existing.description,
					permissions: body.permissions ?? existing.permissions,
				}),
			);
		} catch (err) {
			if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
			if (err instanceof NotFoundError) return c.json({ error: err.message }, 404);
			throw err;
		}
	});

	app.delete('/:id', async (c) => {
		const deleted = await deleteRole(Number(c.req.param('id')));
		if (!deleted) return c.json({ error: 'not found' }, 404);
		return c.json({ ok: true });
	});

	return app;
}
