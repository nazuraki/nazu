import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { runInGraph, escape } from './graph/client.js';
import { loadProjects } from './registry.js';

const server = new Server(
	{ name: 'code-graph', version: '0.1.0' },
	{ capabilities: { tools: {} } }
);

// ── Tool definitions ──────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
	tools: [
		{
			name: 'list_projects',
			description: 'List all indexed projects in the code graph.',
			inputSchema: { type: 'object', properties: {}, required: [] },
		},
		{
			name: 'get_project_overview',
			description: 'Get a summary of a project: file count, symbol count, dependencies, detected services, and entry points.',
			inputSchema: {
				type: 'object',
				properties: { project: { type: 'string', description: 'Project name (e.g. "nazu")' } },
				required: ['project'],
			},
		},
		{
			name: 'find_symbol',
			description: 'Find a symbol (function, class, struct, etc.) by name within a project.',
			inputSchema: {
				type: 'object',
				properties: {
					project: { type: 'string' },
					name: { type: 'string', description: 'Symbol name to search for (partial match)' },
				},
				required: ['project', 'name'],
			},
		},
		{
			name: 'find_callers',
			description: 'Find all symbols that call a given symbol in a project.',
			inputSchema: {
				type: 'object',
				properties: {
					project: { type: 'string' },
					symbol_name: { type: 'string', description: 'The symbol being called' },
				},
				required: ['project', 'symbol_name'],
			},
		},
		{
			name: 'query_code_graph',
			description: 'Run a Cypher query against a project\'s code graph. Nodes: Project, File, Symbol, Dependency, Service, EnvVar. Relationships: DEFINES, CALLS, IMPORTS, EXTENDS, IMPLEMENTS, DEPENDS_ON, CONNECTS_TO, READS_ENV.',
			inputSchema: {
				type: 'object',
				properties: {
					project: { type: 'string' },
					cypher: { type: 'string', description: 'Cypher query to execute' },
				},
				required: ['project', 'cypher'],
			},
		},
		{
			name: 'cross_project_query',
			description: 'Run a Cypher query across all indexed projects and merge results. Use RETURN with named columns.',
			inputSchema: {
				type: 'object',
				properties: { cypher: { type: 'string' } },
				required: ['cypher'],
			},
		},
	],
}));

// ── Tool handlers ─────────────────────────────────────────────────────────────

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

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const { name, arguments: args } = request.params;

	try {
		switch (name) {
			case 'list_projects': {
				const projects = loadProjects();
				const text = projects.map((p) => `${p.name}\t${p.path}\t${p.graph}`).join('\n');
				return { content: [{ type: 'text', text: text || '(no projects registered)' }] };
			}

			case 'get_project_overview': {
				const graph = graphName(str(args?.project));
				const [fileCounts, symbolCounts, deps, services] = await Promise.all([
					runInGraph(graph, `MATCH (f:File) RETURN f.language, count(f) ORDER BY count(f) DESC`),
					runInGraph(graph, `MATCH (s:Symbol) RETURN s.kind, count(s) ORDER BY count(s) DESC`),
					runInGraph(graph, `MATCH (d:Dependency) RETURN d.ecosystem, collect(d.name) LIMIT 20`),
					runInGraph(graph, `MATCH (svc:Service) RETURN svc.name, svc.technology`),
				]);

				const lines = [
					`## ${args?.project} — Code Graph Overview`,
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
					...deps.map((r) => `  [${str(r[0])}] ${(r[1] as string[]).join(', ')}`),
				];
				return { content: [{ type: 'text', text: lines.join('\n') }] };
			}

			case 'find_symbol': {
				const graph = graphName(str(args?.project));
				const name_q = escape(str(args?.name));
				const rows = await runInGraph(
					graph,
					`MATCH (s:Symbol) WHERE toLower(s.name) CONTAINS toLower('${name_q}') RETURN s.name, s.kind, s.signature, s.file, s.line, s.exported ORDER BY s.name LIMIT 30`
				);
				return { content: [{ type: 'text', text: rowsToText(['name', 'kind', 'signature', 'file', 'line', 'exported'], rows) }] };
			}

			case 'find_callers': {
				const graph = graphName(str(args?.project));
				const sym = escape(str(args?.symbol_name));
				const rows = await runInGraph(
					graph,
					`MATCH (caller:Symbol)-[:CALLS]->(callee:Symbol) WHERE callee.name = '${sym}' OR callee.fqn CONTAINS '${sym}' RETURN caller.name, caller.kind, caller.file, caller.line LIMIT 50`
				);
				return { content: [{ type: 'text', text: rowsToText(['caller', 'kind', 'file', 'line'], rows) }] };
			}

			case 'query_code_graph': {
				const graph = graphName(str(args?.project));
				const cypher = str(args?.cypher);
				const rows = await runInGraph(graph, cypher);
				return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
			}

			case 'cross_project_query': {
				const projects = loadProjects();
				const cypher = str(args?.cypher);
				const allResults: Record<string, unknown[][]> = {};
				for (const proj of projects) {
					try {
						const rows = await runInGraph(proj.graph, cypher);
						if (rows.length > 0) allResults[proj.name] = rows;
					} catch {
						// project may not be indexed yet
					}
				}
				return { content: [{ type: 'text', text: JSON.stringify(allResults, null, 2) }] };
			}

			default:
				return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
		}
	} catch (err) {
		return { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
	}
});

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
