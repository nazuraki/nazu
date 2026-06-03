import Redis from 'ioredis';

const GRAPH = process.env.FALKORDB_GRAPH ?? 'second_brain';

let _client: Redis | null = null;

function client(): Redis {
	if (!_client) {
		// Default targets the Compose-internal falkordb service (zero-conf).
		const addr = process.env.FALKORDB_ADDR ?? 'falkordb:6379';
		const colonIdx = addr.lastIndexOf(':');
		const host = addr.slice(0, colonIdx);
		const port = parseInt(addr.slice(colonIdx + 1), 10);
		_client = new Redis({ host, port, lazyConnect: true, enableOfflineQueue: false });
	}
	return _client;
}

export function escape(s: string): string {
	return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

type Row = unknown[];

async function run(cypher: string): Promise<Row[]> {
	const res = (await client().call('GRAPH.QUERY', GRAPH, cypher)) as unknown[][];
	return (res[1] ?? []) as Row[];
}

export async function runInGraph(graph: string, cypher: string): Promise<Row[]> {
	const res = (await client().call('GRAPH.QUERY', graph, cypher)) as unknown[][];
	return (res[1] ?? []) as Row[];
}

export function str(v: unknown): string {
	return v == null ? '' : String(v);
}

export function num(v: unknown): number {
	if (v == null) return 0;
	const n = Number(v);
	return isNaN(n) ? 0 : n;
}

export function strArr(v: unknown): string[] {
	if (!Array.isArray(v)) return [];
	return v.map(String);
}

export interface Entry {
	id: string;
	title: string;
	excerpt: string;
	type: string;
	tags: string[];
	author: string;
	created_at: string;
	updated_at: string;
	ref_count: number;
	word_count: number;
	read_time: number;
	vector_score?: number;
	image_url?: string;
}

export interface EntryDetail extends Entry {
	content: string;
	access_level: string;
	related: Entry[];
}

export interface Tag {
	name: string;
	count: number;
}

export interface SearchResponse {
	query: string;
	total: number;
	duration: string;
	page: number;
	page_size: number;
	entries: Entry[];
}

export async function search(q: string, page: number, pageSize: number): Promise<SearchResponse> {
	const t0 = Date.now();
	const skip = (page - 1) * pageSize;
	const eq = escape(q);

	const rows = await run(`
		MATCH (e:Entry)
		WHERE toLower(e.title) CONTAINS toLower('${eq}')
		   OR toLower(e.content) CONTAINS toLower('${eq}')
		WITH e, size((e)<-[:REFERENCES]-()) AS refs
		RETURN e.id, e.title, e.excerpt, e.type, e.tags, e.author,
		       e.created_at, e.updated_at, refs, e.word_count, e.image_url
		ORDER BY refs DESC
		SKIP ${skip} LIMIT ${pageSize}
	`);

	const countRows = await run(`
		MATCH (e:Entry)
		WHERE toLower(e.title) CONTAINS toLower('${eq}')
		   OR toLower(e.content) CONTAINS toLower('${eq}')
		RETURN count(e)
	`);
	const total = countRows.length > 0 ? num(countRows[0][0]) : 0;

	const entries: Entry[] = rows.map((row) => ({
		id: str(row[0]),
		title: str(row[1]),
		excerpt: str(row[2]),
		type: str(row[3]),
		tags: strArr(row[4]),
		author: str(row[5]),
		created_at: str(row[6]),
		updated_at: str(row[7]),
		ref_count: num(row[8]),
		word_count: num(row[9]),
		read_time: Math.ceil(num(row[9]) / 200),
		image_url: str(row[10]) || undefined
	}));

	return {
		query: q,
		total,
		duration: `${Date.now() - t0}ms`,
		page,
		page_size: pageSize,
		entries
	};
}

export async function getEntry(id: string): Promise<EntryDetail | null> {
	const eid = escape(id);
	const rows = await run(`
		MATCH (e:Entry {id: '${eid}'})
		OPTIONAL MATCH (e)-[:TAGGED]->(t:Tag)
		WITH e, collect(t.name) AS tags, size((e)<-[:REFERENCES]-()) AS refs
		RETURN e.id, e.title, e.content, e.excerpt, e.type, tags, e.author,
		       e.created_at, e.updated_at, refs, e.word_count, e.image_url, e.access_level
	`);
	if (rows.length === 0) return null;
	const row = rows[0];

	const relRows = await run(`
		MATCH (e:Entry {id: '${eid}'})-[:TAGGED]->(t:Tag)<-[:TAGGED]-(r:Entry)
		WHERE r.id <> '${eid}'
		WITH r, count(t) AS shared ORDER BY shared DESC LIMIT 4
		RETURN r.id, r.title, r.excerpt, r.type
	`);
	const related: Entry[] = relRows.map((r) => ({
		id: str(r[0]),
		title: str(r[1]),
		excerpt: str(r[2]),
		type: str(r[3]),
		tags: [],
		author: '',
		created_at: '',
		updated_at: '',
		ref_count: 0,
		word_count: 0,
		read_time: 0
	}));

	const wordCount = num(row[10]);
	return {
		id: str(row[0]),
		title: str(row[1]),
		content: str(row[2]),
		excerpt: str(row[3]),
		type: str(row[4]),
		tags: strArr(row[5]),
		author: str(row[6]),
		created_at: str(row[7]),
		updated_at: str(row[8]),
		ref_count: num(row[9]),
		word_count: wordCount,
		read_time: Math.ceil(wordCount / 200),
		image_url: str(row[11]) || undefined,
		access_level: str(row[12]),
		related
	};
}

export async function getRecent(limit: number): Promise<Entry[]> {
	const rows = await run(`
		MATCH (e:Entry)
		WITH e, size((e)<-[:REFERENCES]-()) AS refs
		RETURN e.id, e.title, e.excerpt, e.type, e.author, e.updated_at, refs, e.image_url
		ORDER BY e.updated_at DESC
		LIMIT ${limit}
	`);
	return rows.map((row) => ({
		id: str(row[0]),
		title: str(row[1]),
		excerpt: str(row[2]),
		type: str(row[3]),
		tags: [],
		author: str(row[4]),
		created_at: '',
		updated_at: str(row[5]),
		ref_count: num(row[6]),
		word_count: 0,
		read_time: 0,
		image_url: str(row[7]) || undefined
	}));
}

export async function getTags(): Promise<Tag[]> {
	const rows = await run(`
		MATCH (t:Tag)<-[:TAGGED]-(e:Entry)
		RETURN t.name, count(e) AS cnt
		ORDER BY cnt DESC
	`);
	return rows.map((row) => ({
		name: str(row[0]),
		count: num(row[1])
	}));
}
