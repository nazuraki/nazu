import { Hono } from 'hono';

import type { Deployer } from './lib/deployer.js';
import type { PromClient } from './lib/prometheus.js';
import type { Registry } from './lib/registry.js';
import type { DeployTarget } from './lib/targets/compose.js';
import type { ImageUpdate } from './lib/updates.js';
import type { ContainerSummary, StreamLogsOptions } from './lib/docker.js';
import { containerRoutes } from './routes/containers.js';
import { metricsRoutes } from './routes/metrics.js';
import { projectRoutes } from './routes/projects.js';

/** Docker operations the routes need — injectable for tests. */
export interface DockerOps {
	listContainers(): Promise<ContainerSummary[]>;
	logsTail(id: string, tail?: number): Promise<string[]>;
	streamLogs(id: string, opts: StreamLogsOptions): void;
}

export interface AppDeps {
	registry: Registry;
	deployer: Deployer;
	target: DeployTarget;
	docker: DockerOps;
	prom: PromClient;
	checkProjectUpdates(images: string[]): Promise<ImageUpdate[]>;
	/** Static bearer key; auth is disabled when empty (zero-conf LAN mode). */
	apiKey?: string;
}

export function createApp(deps: AppDeps): Hono {
	const app = new Hono();

	app.get('/api/health', (c) => c.json({ ok: true }));

	app.use('/api/*', async (c, next) => {
		if (c.req.path === '/api/health' || !deps.apiKey) return next();
		const auth = c.req.header('authorization') ?? '';
		if (auth === `Bearer ${deps.apiKey}`) return next();
		return c.json({ error: 'unauthorized' }, 401);
	});

	app.route('/api/projects', projectRoutes(deps));
	app.route('/api/containers', containerRoutes(deps));
	app.route('/api/metrics', metricsRoutes(deps));

	app.notFound((c) =>
		c.req.path.startsWith('/api/') ? c.json({ error: 'not found' }, 404) : c.text('not found', 404),
	);

	return app;
}
