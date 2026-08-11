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
import { authRoutes, SESSION_COOKIE } from './routes/auth.js';
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
	/** Bearer key + local admin credentials + sessions. Open when none configured. */
	auth: AuthService;
}

/** Auth-exempt paths: liveness, plus what the SPA needs to render a login screen. */
const OPEN_PATHS = new Set(['/api/health', '/api/auth/status', '/api/auth/login', '/api/auth/logout']);

export function createApp(deps: AppDeps): Hono {
	const app = new Hono();

	app.get('/api/health', (c) => c.json({ ok: true }));

	// Auth ladder: bearer key (agents/MCP) → session cookie (browser) → Basic
	// header (curl over HTTPS) → open only when no method is configured. No
	// WWW-Authenticate challenge — the SPA has a login screen, and the native
	// browser popup would fight it.
	app.use('/api/*', async (c, next) => {
		if (OPEN_PATHS.has(c.req.path)) return next();
		const result = deps.auth.authenticate(c.req.header('authorization'), getCookie(c, SESSION_COOKIE));
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
