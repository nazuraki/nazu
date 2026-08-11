import { Hono, type Context } from 'hono';

import type { AppDeps } from '../app.js';
import {
	ValidationError,
	type DeployAction,
	type DeployTrigger,
	type ProjectInput,
} from '../lib/registry.js';

export function projectRoutes(deps: AppDeps): Hono {
	const app = new Hono();

	app.get('/', (c) => c.json({ projects: deps.registry.listProjects() }));

	app.post('/', async (c) => {
		try {
			const input = (await c.req.json()) as Partial<ProjectInput>;
			const project = deps.registry.saveProject({
				name: input.name ?? '',
				gitUrl: input.gitUrl ?? '',
				branch: input.branch?.trim() || 'main',
				images: input.images ?? [],
				target: input.target ?? { type: 'compose' },
				autoDeploy: input.autoDeploy ?? false,
			});
			return c.json({ project }, 201);
		} catch (err) {
			if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
			throw err;
		}
	});

	app.get('/:name', (c) => {
		const project = deps.registry.getProject(c.req.param('name'));
		if (!project) return c.json({ error: 'unknown project' }, 404);
		return c.json({ project });
	});

	app.delete('/:name', (c) => {
		if (!deps.registry.deleteProject(c.req.param('name'))) {
			return c.json({ error: 'unknown project' }, 404);
		}
		return c.json({ ok: true });
	});

	app.get('/:name/status', async (c) => {
		const project = deps.registry.getProject(c.req.param('name'));
		if (!project) return c.json({ error: 'unknown project' }, 404);
		try {
			return c.json({ services: await deps.target.status(project) });
		} catch (err) {
			return c.json({ error: err instanceof Error ? err.message : String(err) }, 502);
		}
	});

	app.get('/:name/updates', async (c) => {
		const project = deps.registry.getProject(c.req.param('name'));
		if (!project) return c.json({ error: 'unknown project' }, 404);
		return c.json({ updates: await deps.checkProjectUpdates(project.images) });
	});

	// Doubles as the CI webhook: POST with the API key when a new image is pushed.
	app.post('/:name/deploy', (c) => startRun(c.req.param('name'), 'deploy', c, deps));
	// Pull + up to the newest images without git-syncing the checkout.
	app.post('/:name/update', (c) => startRun(c.req.param('name'), 'update', c, deps));
	app.post('/:name/restart', (c) => startRun(c.req.param('name'), 'restart', c, deps));

	app.get('/:name/deploys', (c) => {
		const project = deps.registry.getProject(c.req.param('name'));
		if (!project) return c.json({ error: 'unknown project' }, 404);
		const limit = Number(c.req.query('limit') ?? '20');
		const deploys = deps.registry
			.listDeploys(project.name, Number.isFinite(limit) ? limit : 20)
			.map(({ log: _log, ...rest }) => rest);
		return c.json({ deploys });
	});

	app.get('/:name/deploys/:id', (c) => {
		const deploy = deps.registry.getDeploy(Number(c.req.param('id')));
		if (!deploy || deploy.project !== c.req.param('name')) {
			return c.json({ error: 'unknown deploy' }, 404);
		}
		return c.json({ deploy });
	});

	return app;
}

function startRun(name: string, action: DeployAction, c: Context, deps: AppDeps): Response {
	const project = deps.registry.getProject(name);
	if (!project) return c.json({ error: 'unknown project' }, 404);
	const trigger = (c.req.query('trigger') as DeployTrigger) || 'manual';
	const record = deps.deployer.start(project, action, trigger);
	return c.json({ deploy: record }, 202);
}
