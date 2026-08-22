import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';

import type { Deployer } from './lib/deployer.js';
import type { PromClient } from './lib/prometheus.js';
import type { Registry } from './lib/registry.js';
import type { DeployTarget } from './lib/targets/compose.js';
import type { ImageUpdate } from './lib/updates.js';
import type { ContainerSummary, StreamLogsOptions } from './lib/docker.js';
import type { HelperStatus, SelfInfo } from './lib/self-update.js';
import type { AuthService } from './lib/auth.js';
import { SSO_COOKIE } from './lib/sso.js';
import { authRoutes } from './routes/auth.js';
import { containerRoutes } from './routes/containers.js';
import { metricsRoutes } from './routes/metrics.js';
import { projectRoutes } from './routes/projects.js';
import { selfRoutes } from './routes/self.js';

/** Docker operations the routes need — injectable for tests. */
export interface DockerOps {
	listContainers(): Promise<ContainerSummary[]>;
	logsTail(id: string, tail?: number): Promise<string[]>;
	streamLogs(id: string, opts: StreamLogsOptions): void;
}

/** Self-update operations — injectable for tests. */
export interface SelfOps {
	inspect(): Promise<SelfInfo>;
	helperStatus(): Promise<HelperStatus | null>;
	update(): Promise<{ helperId: string; info: SelfInfo }>;
}

export interface AppDeps {
	registry: Registry;
	deployer: Deployer;
	target: DeployTarget;
	docker: DockerOps;
	self: SelfOps;
	prom: PromClient;
	checkProjectUpdates(images: string[]): Promise<ImageUpdate[]>;
	/** Bearer key + usr SSO cookie. Open when neither is configured. */
	auth: AuthService;
}

/** Auth-exempt paths: liveness, plus what the SPA needs to decide whether to sign in. */
const OPEN_PATHS = new Set(['/api/health', '/api/auth/status']);

export function createApp(deps: AppDeps): Hono {
	const app = new Hono();

	app.get('/api/health', (c) => c.json({ ok: true }));

	// Auth ladder: bearer key (agents/MCP) → usr SSO cookie `nz_id` (browser)
	// → open only when no method is configured. Plain 401 JSON — the SPA
	// bounces the browser to usr to (re)establish the cookie.
	app.use('/api/*', async (c, next) => {
		if (OPEN_PATHS.has(c.req.path)) return next();
		const result = await deps.auth.authenticate(c.req.header('authorization'), getCookie(c, SSO_COOKIE));
		if (result) return next();
		return c.json({ error: 'unauthorized' }, 401);
	});

	app.route('/api/auth', authRoutes(deps));
	app.route('/api/projects', projectRoutes(deps));
	app.route('/api/containers', containerRoutes(deps));
	app.route('/api/metrics', metricsRoutes(deps));
	app.route('/api/self', selfRoutes(deps));

	app.notFound((c) =>
		c.req.path.startsWith('/api/') ? c.json({ error: 'not found' }, 404) : c.text('not found', 404),
	);

	return app;
}
