import { join } from 'node:path';

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';

import { createApp } from './app.js';
import { Deployer } from './lib/deployer.js';
import * as docker from './lib/docker.js';
import { createPromClient } from './lib/prometheus.js';
import { Registry } from './lib/registry.js';
import { SelfUpdater } from './lib/self-update.js';
import { ComposeTarget } from './lib/targets/compose.js';
import { checkImages } from './lib/updates.js';

const PORT = Number(process.env.PORT ?? 8430);
const DATA_DIR = process.env.BACKPLANE_DATA_DIR ?? './data';
const PROMETHEUS_URL = process.env.PROMETHEUS_URL ?? 'http://prometheus:9090';
const API_KEY = process.env.BACKPLANE_API_KEY?.trim() || undefined;
const POLL_INTERVAL_MS = Number(process.env.BACKPLANE_POLL_INTERVAL ?? 300) * 1000;

const registry = new Registry(join(DATA_DIR, 'backplane.db'));
const target = new ComposeTarget({ workdirRoot: join(DATA_DIR, 'workdirs') });
const deployer = new Deployer(registry, target);

const app = createApp({
	registry,
	deployer,
	target,
	docker,
	self: new SelfUpdater(),
	prom: createPromClient(PROMETHEUS_URL),
	checkProjectUpdates: async (images) => checkImages(images, await docker.runningImageDigests()),
	apiKey: API_KEY,
});

// Static SPA (built by vite into dist/ui), with an index.html fallback for
// client-side routes. API routes are matched first.
app.use('*', serveStatic({ root: './dist/ui' }));
app.get('*', serveStatic({ path: './dist/ui/index.html' }));

// Digest poller: auto-deploy projects that opted in when a watched image moves.
if (POLL_INTERVAL_MS > 0) {
	setInterval(async () => {
		try {
			const running = await docker.runningImageDigests();
			for (const project of registry.listProjects()) {
				if (!project.autoDeploy || project.images.length === 0) continue;
				const updates = await checkImages(project.images, running);
				if (updates.some((u) => u.updateAvailable)) {
					console.log(`[poller] update detected for ${project.name}; deploying`);
					deployer.start(project, 'deploy', 'poll');
				}
			}
		} catch (err) {
			console.error('[poller]', err);
		}
	}, POLL_INTERVAL_MS).unref();
}

serve({ fetch: app.fetch, port: PORT }, (info) => {
	console.log(`backplane listening on :${info.port} (auth: ${API_KEY ? 'api-key' : 'open'})`);
});
