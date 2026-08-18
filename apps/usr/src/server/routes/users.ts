import { Hono } from 'hono';

import type { AppEnv } from '../app.js';
import { listUserRoles, setUserRoles } from '../lib/roles.js';
import {
	createUser,
	deleteUser,
	getUser,
	listUsers,
	NotFoundError,
	updateProfile,
	ValidationError,
	type ProfileInput,
} from '../lib/users.js';

/** Admin CRUD for the user roster and per-user role assignment. */
export function usersRoutes(): Hono<AppEnv> {
	const app = new Hono<AppEnv>();

	app.use('*', async (c, next) => {
		if (!c.var.user.admin) return c.json({ error: 'admin required' }, 403);
		return next();
	});

	app.get('/', async (c) => c.json(await listUsers()));

	app.post('/', async (c) => {
		const body = (await c.req.json().catch(() => ({}))) as ProfileInput & {
			email?: string;
			roleIds?: number[];
		};
		if (!body.email) return c.json({ error: 'email required' }, 400);
		try {
			const user = await createUser(body.email, body);
			if (body.roleIds?.length) await setUserRoles(user.id, body.roleIds);
			return c.json({ ...user, roles: await listUserRoles(user.id) }, 201);
		} catch (err) {
			if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
			throw err;
		}
	});

	app.get('/:id', async (c) => {
		const id = Number(c.req.param('id'));
		const user = await getUser(id);
		if (!user) return c.json({ error: 'not found' }, 404);
		return c.json({ ...user, roles: await listUserRoles(id) });
	});

	app.patch('/:id', async (c) => {
		const id = Number(c.req.param('id'));
		const body = (await c.req.json().catch(() => ({}))) as ProfileInput;
		try {
			return c.json(await updateProfile(id, body));
		} catch (err) {
			if (err instanceof NotFoundError) return c.json({ error: err.message }, 404);
			throw err;
		}
	});

	app.delete('/:id', async (c) => {
		try {
			const deleted = await deleteUser(Number(c.req.param('id')));
			if (!deleted) return c.json({ error: 'not found' }, 404);
			return c.json({ ok: true });
		} catch (err) {
			if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
			throw err;
		}
	});

	app.put('/:id/roles', async (c) => {
		const id = Number(c.req.param('id'));
		if (!(await getUser(id))) return c.json({ error: 'not found' }, 404);
		const body = (await c.req.json().catch(() => ({}))) as { roleIds?: number[] };
		if (!Array.isArray(body.roleIds)) return c.json({ error: 'roleIds must be an array' }, 400);
		await setUserRoles(id, body.roleIds);
		return c.json(await listUserRoles(id));
	});

	return app;
}
