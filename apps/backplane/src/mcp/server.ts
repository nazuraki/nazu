#!/usr/bin/env node
/**
 * backplane MCP — agentic control surface over the backplane REST API, an
 * equal client alongside the web UI. A thin stdio MCP; all logic stays in the
 * backplane server.
 *
 * Config (env):
 *   BACKPLANE_URL      base URL of the backplane (default http://localhost:8430)
 *   BACKPLANE_API_KEY  static key sent as `Authorization: Bearer <key>`
 */
import { McpServer, fromJsonSchema, type CallToolResult } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { api, formatDeploy, formatProjects, formatStatus, formatUpdates } from './client.js';

function textResult(text: string): CallToolResult {
	return { content: [{ type: 'text', text }] };
}

function errorResult(err: unknown): CallToolResult {
	return {
		content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
		isError: true,
	};
}

const nameSchema = fromJsonSchema<{ name: string }>({
	type: 'object',
	properties: { name: { type: 'string', description: 'Registered project name' } },
	required: ['name'],
});

function buildServer(): McpServer {
	const server = new McpServer({ name: 'nazu-backplane', version: '0.1.0' });

	server.registerTool(
		'list_projects',
		{
			description:
				'List projects registered in the deploy backplane: git repo, watched images, deploy target, auto-deploy flag.',
			inputSchema: fromJsonSchema<Record<string, never>>({ type: 'object', properties: {} }),
		},
		async () => {
			try {
				return textResult(await formatProjects());
			} catch (err) {
				return errorResult(err);
			}
		},
	);

	server.registerTool(
		'project_status',
		{
			description:
				'Live status of a project: its compose services (state, image) plus whether newer images are available in the registry.',
			inputSchema: nameSchema,
		},
		async ({ name }) => {
			try {
				const [status, updates] = await Promise.all([formatStatus(name), formatUpdates(name)]);
				return textResult(`${status}\n\n${updates}`);
			} catch (err) {
				return errorResult(err);
			}
		},
	);

	server.registerTool(
		'deploy_project',
		{
			description:
				'Deploy a project: git-sync its repo, pull images, and `docker compose up` its stack. Returns the queued deploy id; follow with deploy_status.',
			inputSchema: nameSchema,
		},
		async ({ name }) => {
			try {
				const res = await api<{ deploy: { id: number } }>(`/api/projects/${name}/deploy`, 'POST');
				return textResult(`Deploy #${res.deploy.id} queued for ${name}.`);
			} catch (err) {
				return errorResult(err);
			}
		},
	);

	server.registerTool(
		'restart_project',
		{
			description: "Restart a project's compose stack without pulling new images.",
			inputSchema: nameSchema,
		},
		async ({ name }) => {
			try {
				const res = await api<{ deploy: { id: number } }>(`/api/projects/${name}/restart`, 'POST');
				return textResult(`Restart #${res.deploy.id} queued for ${name}.`);
			} catch (err) {
				return errorResult(err);
			}
		},
	);

	server.registerTool(
		'deploy_status',
		{
			description: 'Status and captured log of a specific deploy/restart run.',
			inputSchema: fromJsonSchema<{ name: string; id: number }>({
				type: 'object',
				properties: {
					name: { type: 'string', description: 'Project name' },
					id: { type: 'number', description: 'Deploy id returned by deploy_project/restart_project' },
				},
				required: ['name', 'id'],
			}),
		},
		async ({ name, id }) => {
			try {
				return textResult(await formatDeploy(name, id));
			} catch (err) {
				return errorResult(err);
			}
		},
	);

	server.registerTool(
		'list_containers',
		{
			description: 'List all containers on the host with state, image, and compose project/service.',
			inputSchema: fromJsonSchema<Record<string, never>>({ type: 'object', properties: {} }),
		},
		async () => {
			try {
				const { containers } = await api<{
					containers: { name: string; image: string; state: string; status: string; composeProject: string | null }[];
				}>('/api/containers');
				if (containers.length === 0) return textResult('No containers.');
				const lines = containers.map(
					(c) => `• ${c.name} [${c.state}] ${c.status} — ${c.image}${c.composeProject ? ` (${c.composeProject})` : ''}`,
				);
				return textResult(lines.join('\n'));
			} catch (err) {
				return errorResult(err);
			}
		},
	);

	server.registerTool(
		'container_logs',
		{
			description: 'Tail the last N log lines of a container (by name or id).',
			inputSchema: fromJsonSchema<{ id: string; tail?: number }>({
				type: 'object',
				properties: {
					id: { type: 'string', description: 'Container name or id' },
					tail: { type: 'number', description: 'Lines to tail (default 100)' },
				},
				required: ['id'],
			}),
		},
		async ({ id, tail }) => {
			try {
				const n = typeof tail === 'number' && tail > 0 ? Math.floor(tail) : 100;
				return textResult(await api<string>(`/api/containers/${id}/logs?tail=${n}`, 'GET', true));
			} catch (err) {
				return errorResult(err);
			}
		},
	);

	server.registerTool(
		'query_metrics',
		{
			description:
				"Run a PromQL range query against the backplane's Prometheus (cAdvisor per-container CPU/mem, Caddy request metrics). Times are unix seconds or RFC3339; step like '15s'.",
			inputSchema: fromJsonSchema<{ query: string; start: string; end: string; step: string }>({
				type: 'object',
				properties: {
					query: { type: 'string', description: 'PromQL expression' },
					start: { type: 'string', description: 'Range start' },
					end: { type: 'string', description: 'Range end' },
					step: { type: 'string', description: "Resolution step, e.g. '15s'" },
				},
				required: ['query', 'start', 'end', 'step'],
			}),
		},
		async ({ query, start, end, step }) => {
			try {
				const params = new URLSearchParams({ query, start, end, step });
				const body = await api<unknown>(`/api/metrics/query_range?${params}`);
				return textResult(JSON.stringify(body, null, 2));
			} catch (err) {
				return errorResult(err);
			}
		},
	);

	return server;
}

const handle = serveStdio(() => buildServer());
process.on('SIGINT', () => {
	void handle.close();
});
