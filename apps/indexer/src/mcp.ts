import { McpServer, fromJsonSchema, type CallToolResult } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { runInGraph, escape } from './graph/client.js';
import { loadProjects } from './registry.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function graphName(project: string): string {
	return project.startsWith('code:') ? project : `code:${project}`;
}

function str(v: unknown): string {
	return v == null ? '' : String(v);
}

function rowsToText(headers: string[], rows: unknown[][]): string {
	if (rows.length === 0) return '(no results)';
	const lines = rows.map((row) => row.map((v) => str(v)).join('\t'));
	return [headers.join('\t'), ...lines].join('\n');
}

function textResult(text: string): CallToolResult {
	return { content: [{ type: 'text', text }] };
}

function errorResult(err: unknown): CallToolResult {
	return { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
}

// ── Tool schemas ──────────────────────────────────────────────────────────────

const projectSchema = fromJsonSchema<{ project: string }>({
	type: 'object',
	properties: { project: { type: 'string', description: 'Project name (e.g. "nazu")' } },
	required: ['project']
});

const findSymbolSchema = fromJsonSchema<{ project: string; name: string }>({
	type: 'object',
	properties: {
		project: { type: 'string' },
		name: { type: 'string', description: 'Symbol name to search for (partial match)' }
	},
	required: ['project', 'name']
});

const findCallersSchema = fromJsonSchema<{ project: string; symbol_name: string }>({
	type: 'object',
	properties: {
		project: { type: 'string' },
		symbol_name: { type: 'string', description: 'The symbol being called' }
	},
	required: ['project', 'symbol_name']
});

const projectCypherSchema = fromJsonSchema<{ project: string; cypher: string }>({
	type: 'object',
	properties: {
		project: { type: 'string' },
		cypher: { type: 'string', description: 'Cypher query to execute' }
	},
	required: ['project', 'cypher']
});

const cypherSchema = fromJsonSchema<{ cypher: string }>({
	type: 'object',
	properties: { cypher: { type: 'string' } },
	required: ['cypher']
});

// ── Server ────────────────────────────────────────────────────────────────────

function buildServer(): McpServer {
	const server = new McpServer({ name: 'code-graph', version: '0.2.0' });

	server.registerTool(
		'list_projects',
		{ description: 'List all indexed projects in the code graph.' },
		async () => {
			try {
				const projects = loadProjects();
				const text = projects.map((p) => `${p.name}\t${p.path}\t${p.graph}`).join('\n');
				return textResult(text || '(no projects registered)');
			} catch (err) {
				return errorResult(err);
			}
		}
	);

	server.registerTool(
		'get_project_overview',
		{
			description:
				'Get a summary of a project: file count, symbol count, dependencies, detected services, and entry points.',
			inputSchema: projectSchema
		},
		async ({ project }) => {
			try {
				const graph = graphName(project);
				const [fileCounts, symbolCounts, deps, services] = await Promise.all([
					runInGraph(graph, `MATCH (f:File) RETURN f.language, count(f) ORDER BY count(f) DESC`),
					runInGraph(graph, `MATCH (s:Symbol) RETURN s.kind, count(s) ORDER BY count(s) DESC`),
					runInGraph(graph, `MATCH (d:Dependency) RETURN d.ecosystem, collect(d.name) LIMIT 20`),
					runInGraph(graph, `MATCH (svc:Service) RETURN svc.name, svc.technology`)
				]);

				const lines = [
					`## ${project} — Code Graph Overview`,
					'',
					'### Files by language',
					...fileCounts.map((r) => `  ${str(r[0])}: ${str(r[1])}`),
					'',
					'### Symbols by kind',
					...symbolCounts.map((r) => `  ${str(r[0])}: ${str(r[1])}`),
					'',
					'### Detected services',
					services.length ? services.map((r) => `  ${str(r[0])} (${str(r[1])})`).join('\n') : '  (none)',
					'',
					'### Dependencies (sample)',
					...deps.map((r) => {
						const names = Array.isArray(r[1]) ? (r[1] as unknown[]).map(str) : [str(r[1])].filter(Boolean);
						return `  [${str(r[0])}] ${names.join(', ')}`;
					})
				];
				return textResult(lines.join('\n'));
			} catch (err) {
				return errorResult(err);
			}
		}
	);

	server.registerTool(
		'find_symbol',
		{
			description: 'Find a symbol (function, class, struct, etc.) by name within a project.',
			inputSchema: findSymbolSchema
		},
		async ({ project, name }) => {
			try {
				const graph = graphName(project);
				const name_q = escape(name);
				const rows = await runInGraph(
					graph,
					`MATCH (s:Symbol) WHERE toLower(s.name) CONTAINS toLower('${name_q}') RETURN s.name, s.kind, s.signature, s.file, s.line, s.exported ORDER BY s.name LIMIT 30`
				);
				return textResult(rowsToText(['name', 'kind', 'signature', 'file', 'line', 'exported'], rows));
			} catch (err) {
				return errorResult(err);
			}
		}
	);

	server.registerTool(
		'find_callers',
		{
			description: 'Find all symbols that call a given symbol in a project.',
			inputSchema: findCallersSchema
		},
		async ({ project, symbol_name }) => {
			try {
				const graph = graphName(project);
				const sym = escape(symbol_name);
				const rows = await runInGraph(
					graph,
					`MATCH (caller:Symbol)-[:CALLS]->(callee:Symbol) WHERE callee.name = '${sym}' OR callee.fqn CONTAINS '${sym}' RETURN caller.name, caller.kind, caller.file, caller.line LIMIT 50`
				);
				return textResult(rowsToText(['caller', 'kind', 'file', 'line'], rows));
			} catch (err) {
				return errorResult(err);
			}
		}
	);

	server.registerTool(
		'query_code_graph',
		{
			description:
				"Run a Cypher query against a project's code graph. Nodes: Project, File, Symbol, Dependency, Service, EnvVar. Relationships: DEFINES, CALLS, IMPORTS, EXTENDS, IMPLEMENTS, DEPENDS_ON, CONNECTS_TO, READS_ENV.",
			inputSchema: projectCypherSchema
		},
		async ({ project, cypher }) => {
			try {
				const rows = await runInGraph(graphName(project), cypher);
				return textResult(JSON.stringify(rows, null, 2));
			} catch (err) {
				return errorResult(err);
			}
		}
	);

	server.registerTool(
		'cross_project_query',
		{
			description:
				'Run a Cypher query across all indexed projects and merge results. Use RETURN with named columns.',
			inputSchema: cypherSchema
		},
		async ({ cypher }) => {
			try {
				const projects = loadProjects();
				const allResults: Record<string, unknown[][]> = {};
				for (const proj of projects) {
					try {
						const rows = await runInGraph(proj.graph, cypher);
						if (rows.length > 0) allResults[proj.name] = rows;
					} catch {
						// project may not be indexed yet
					}
				}
				return textResult(JSON.stringify(allResults, null, 2));
			} catch (err) {
				return errorResult(err);
			}
		}
	);

	return server;
}

// ── Start ─────────────────────────────────────────────────────────────────────

const handle = serveStdio(() => buildServer());
process.on('SIGINT', () => {
	void handle.close();
});
