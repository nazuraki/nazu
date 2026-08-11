import { Hono } from 'hono';
import { streamText } from 'hono/streaming';

import type { AppDeps } from '../app.js';

export function containerRoutes(deps: AppDeps): Hono {
	const app = new Hono();

	app.get('/', async (c) => c.json({ containers: await deps.docker.listContainers() }));

	// Plain-text log tail; `?follow=1` switches to a chunked live stream
	// (fetch-readable — works with an Authorization header, unlike EventSource).
	app.get('/:id/logs', async (c) => {
		const id = c.req.param('id');
		const tail = Number(c.req.query('tail') ?? '200');

		if (c.req.query('follow') !== '1') {
			const lines = await deps.docker.logsTail(id, Number.isFinite(tail) ? tail : 200);
			return c.text(lines.join('\n') + (lines.length ? '\n' : ''));
		}

		return streamText(c, async (stream) => {
			let done: () => void;
			const finished = new Promise<void>((r) => (done = r));
			const abort = new AbortController();
			stream.onAbort(() => {
				abort.abort();
				done();
			});
			deps.docker.streamLogs(id, {
				tail: Number.isFinite(tail) ? tail : 200,
				signal: abort.signal,
				onLine: (line) => void stream.write(line + '\n'),
				onEnd: () => done(),
				onError: (err) => {
					void stream.write(`stream error: ${err instanceof Error ? err.message : String(err)}\n`);
					done();
				},
			});
			await finished;
		});
	});

	return app;
}
