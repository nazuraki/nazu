import { Hono } from 'hono';

import type { AppDeps } from '../app.js';
import { SelfUpdateInProgressError, SelfUpdateUnavailableError } from '../lib/self-update.js';

/**
 * The backplane's own update surface: report whether a newer backplane image
 * is published, and kick off a self-update via the detached helper container.
 */
export function selfRoutes(deps: AppDeps): Hono {
	const app = new Hono();

	app.get('/', async (c) => {
		try {
			const info = await deps.self.inspect();
			const [update] = await deps.checkProjectUpdates([info.image]);
			const helper = await deps.self.helperStatus();
			return c.json({ self: { composeProject: info.composeProject, ...update }, helper });
		} catch (err) {
			if (err instanceof SelfUpdateUnavailableError) {
				return c.json({ self: null, helper: null, error: err.message });
			}
			throw err;
		}
	});

	app.post('/update', async (c) => {
		try {
			const { helperId } = await deps.self.update();
			return c.json({ started: true, helper: helperId }, 202);
		} catch (err) {
			if (err instanceof SelfUpdateInProgressError) return c.json({ error: err.message }, 409);
			if (err instanceof SelfUpdateUnavailableError) return c.json({ error: err.message }, 400);
			throw err;
		}
	});

	return app;
}
