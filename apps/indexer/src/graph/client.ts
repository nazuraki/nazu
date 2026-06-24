import Redis from 'ioredis';

let _client: Redis | null = null;

function getClient(): Redis {
	if (!_client) {
		const addr = process.env.FALKORDB_ADDR ?? 'localhost:6380';
		const colonIdx = addr.lastIndexOf(':');
		const host = addr.slice(0, colonIdx);
		const port = parseInt(addr.slice(colonIdx + 1), 10);
		_client = new Redis({
			host,
			port,
			// Offline queue ON (ioredis default): buffer commands issued before the
			// connection is `ready`, so the first tool call on a cold MCP start waits
			// for the socket instead of rejecting with "Stream isn't writeable".
			connectTimeout: 5000,
			maxRetriesPerRequest: 3,
			// Bound reconnection so a genuinely-down FalkorDB fails in finite time
			// (queued commands reject) rather than hanging forever.
			retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 1000)),
		});
		// Prevent Node.js from crashing on connection errors — they surface through rejected promises
		_client.on('error', () => {});
	}
	return _client;
}

export async function runInGraph(graph: string, cypher: string): Promise<unknown[][]> {
	const res = (await getClient().call('GRAPH.QUERY', graph, cypher)) as unknown[][];
	return (res[1] ?? []) as unknown[][];
}

export async function listCodeGraphs(): Promise<string[]> {
	// FalkorDB doesn't expose a native graph list command; we read from projects.json instead
	return [];
}

export async function deleteGraph(graph: string): Promise<void> {
	try {
		await getClient().call('GRAPH.DELETE', graph);
	} catch {
		// graph may not exist yet — that's fine
	}
}

export async function disconnect(): Promise<void> {
	if (_client) {
		await _client.quit();
		_client = null;
	}
}

export function escape(s: string): string {
	return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function toCypherValue(v: unknown): string {
	if (v === null || v === undefined) return 'null';
	if (typeof v === 'string') return `'${escape(v)}'`;
	if (typeof v === 'number' || typeof v === 'boolean') return String(v);
	if (Array.isArray(v)) return `[${v.map(toCypherValue).join(', ')}]`;
	return 'null';
}
