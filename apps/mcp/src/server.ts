#!/usr/bin/env node
/**
 * nazu Memory MCP — gives an AI agent a durable store/recall loop over nazu's
 * knowledge base. A thin stdio MCP that wraps nazu's REST API:
 *   - `recall`   → GET  /api/search
 *   - `remember` → POST /api/remember
 *
 * Config (env):
 *   NAZU_URL      base URL of the nazu web app (default http://localhost:8420)
 *   NAZU_API_KEY  static key sent as `Authorization: Bearer <key>` (required
 *                 unless nazu is in zero-conf open mode on the LAN)
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const NAZU_URL = (process.env.NAZU_URL ?? 'http://localhost:8420').replace(/\/+$/, '');
const API_KEY = process.env.NAZU_API_KEY?.trim() ?? '';

function headers(extra: Record<string, string> = {}): Record<string, string> {
	return API_KEY ? { Authorization: `Bearer ${API_KEY}`, ...extra } : extra;
}

interface SearchEntry {
	id: string;
	title: string;
	type: string;
	excerpt: string;
	tags: string[];
	created_at: string;
}

async function recall(query: string, limit: number): Promise<string> {
	const url = new URL(`${NAZU_URL}/api/search`);
	url.searchParams.set('q', query);
	url.searchParams.set('page_size', String(limit));

	const res = await fetch(url, { headers: headers() });
	if (!res.ok) throw new Error(`recall failed: HTTP ${res.status} — ${await res.text()}`);

	const data = (await res.json()) as { total: number; entries: SearchEntry[] };
	if (data.entries.length === 0) return `No knowledge found for "${query}".`;

	const lines = data.entries.map((e) => {
		const tags = e.tags?.length ? `\n  tags: ${e.tags.join(', ')}` : '';
		return `• [${e.type}] ${e.title}  (id: ${e.id})\n  ${e.excerpt || '(no excerpt)'}${tags}`;
	});
	return `${data.total} result(s) for "${query}":\n\n${lines.join('\n\n')}`;
}

interface RememberInput {
	content: string;
	title?: string;
	type?: string;
	tags?: string[];
	source_url?: string;
}

async function remember(input: RememberInput): Promise<string> {
	const res = await fetch(`${NAZU_URL}/api/remember`, {
		method: 'POST',
		headers: headers({ 'content-type': 'application/json' }),
		body: JSON.stringify(input)
	});
	if (!res.ok) throw new Error(`remember failed: HTTP ${res.status} — ${await res.text()}`);

	const data = (await res.json()) as { id: string; title: string };
	return `Remembered "${data.title}" (id: ${data.id}).`;
}

// ── MCP wiring ────────────────────────────────────────────────────────────────

const server = new Server(
	{ name: 'nazu-memory', version: '0.1.0' },
	{ capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
	tools: [
		{
			name: 'recall',
			description:
				"Search nazu's knowledge base for previously stored facts, notes, decisions, and documents. Use this to retrieve what you (or the user) have saved before.",
			inputSchema: {
				type: 'object',
				properties: {
					query: { type: 'string', description: 'Full-text search query' },
					limit: { type: 'number', description: 'Max results (default 10)' }
				},
				required: ['query']
			}
		},
		{
			name: 'remember',
			description:
				"Store a fact, note, decision, or document into nazu's knowledge base so it can be recalled in future sessions. Title is optional — it is derived from the content when omitted.",
			inputSchema: {
				type: 'object',
				properties: {
					content: { type: 'string', description: 'The knowledge to store (markdown ok)' },
					title: { type: 'string', description: 'Optional title; derived from content if omitted' },
					type: { type: 'string', description: "Entry kind, e.g. 'note', 'fact', 'decision', 'article' (default 'note')" },
					tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags for later discovery' },
					source_url: { type: 'string', description: 'Optional source URL' }
				},
				required: ['content']
			}
		}
	]
}));

function str(v: unknown): string {
	return v == null ? '' : String(v);
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const { name, arguments: args } = request.params;
	try {
		switch (name) {
			case 'recall': {
				const query = str(args?.query).trim();
				if (!query) throw new Error('query is required');
				const limit = typeof args?.limit === 'number' && args.limit > 0 ? Math.floor(args.limit) : 10;
				return { content: [{ type: 'text', text: await recall(query, limit) }] };
			}
			case 'remember': {
				const content = str(args?.content).trim();
				if (!content) throw new Error('content is required');
				const tags = Array.isArray(args?.tags) ? (args.tags as unknown[]).map(str).filter(Boolean) : undefined;
				const text = await remember({
					content,
					title: args?.title ? str(args.title) : undefined,
					type: args?.type ? str(args.type) : undefined,
					tags,
					source_url: args?.source_url ? str(args.source_url) : undefined
				});
				return { content: [{ type: 'text', text }] };
			}
			default:
				return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
		}
	} catch (err) {
		return {
			content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
			isError: true
		};
	}
});

const transport = new StdioServerTransport();
await server.connect(transport);
