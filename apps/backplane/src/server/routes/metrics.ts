import { Hono } from 'hono';

import type { AppDeps } from '../app.js';

export function metricsRoutes(deps: AppDeps): Hono {
	const app = new Hono();

	app.get('/query_range', async (c) => {
		const { query, start, end, step } = c.req.query();
		if (!query || !start || !end || !step) {
			return c.json({ error: 'query, start, end, and step are required' }, 400);
		}
		try {
			const res = await deps.prom.queryRange({ query, start, end, step });
			return c.json(res.body as object, res.status as 200);
		} catch (err) {
			return c.json({ error: `prometheus unreachable: ${err instanceof Error ? err.message : err}` }, 502);
		}
	});

	app.get('/query', async (c) => {
		const { query, time } = c.req.query();
		if (!query) return c.json({ error: 'query is required' }, 400);
		try {
			const res = await deps.prom.query({ query, time });
			return c.json(res.body as object, res.status as 200);
		} catch (err) {
			return c.json({ error: `prometheus unreachable: ${err instanceof Error ? err.message : err}` }, 502);
		}
	});

	return app;
}
