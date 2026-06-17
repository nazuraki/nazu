import { getSql } from './db.js';
import { searchGraph, type GraphFact } from './graphiti.js';
import { getDocumentText } from './storage.js';

import type { Entry, EntryDetail, Tag, SearchResponse } from '$lib/search/types.js';

export async function search(q: string, page: number, pageSize: number): Promise<SearchResponse> {
	const t0 = Date.now();
	const sql = getSql();
	const skip = (page - 1) * pageSize;

	// Match title/summary (kb_index, the lean topic index) OR document body
	// (documents.body_search, the raw-store FTS layer — #51). The OR lets Postgres
	// BitmapOr the two GIN indexes. Rank with weighted lexemes so title (A) >
	// summary (B) > body (C): body-only hits surface, ranked below title/summary.
	const rows = await sql<
		{
			id: string;
			title: string;
			excerpt: string | null;
			type: string;
			tags: string[];
			author: string | null;
			created_at: Date;
			word_count: number;
			snippet: string | null;
		}[]
	>`
		SELECT k.id, k.title, k.excerpt, k.type, k.tags, d.author, k.created_at, k.word_count,
		       snip.snippet
		FROM kb_index k
		JOIN documents d ON d.id = k.document_id
		-- Best-matching chunk → a passage snippet (#25). Plain-text fragment; the UI
		-- highlights the query client-side, so ts_headline emits no markup itself.
		LEFT JOIN LATERAL (
			SELECT ts_headline(
				'english', c.content, plainto_tsquery('english', ${q}),
				'StartSel=,StopSel=,MaxFragments=2,MinWords=8,MaxWords=30,FragmentDelimiter= … '
			) AS snippet
			FROM document_chunks c
			WHERE c.document_id = k.document_id
			  AND c.body_search @@ plainto_tsquery('english', ${q})
			ORDER BY ts_rank(c.body_search, plainto_tsquery('english', ${q})) DESC
			LIMIT 1
		) snip ON true
		WHERE to_tsvector('english', k.title || ' ' || COALESCE(k.excerpt, ''))
		      @@ plainto_tsquery('english', ${q})
		   OR d.body_search @@ plainto_tsquery('english', ${q})
		ORDER BY ts_rank(
			         setweight(to_tsvector('english', k.title), 'A') ||
			         setweight(to_tsvector('english', COALESCE(k.excerpt, '')), 'B') ||
			         setweight(COALESCE(d.body_search, ''::tsvector), 'C'),
			         plainto_tsquery('english', ${q})
			     ) DESC,
			     k.created_at DESC
		LIMIT ${pageSize} OFFSET ${skip}
	`;

	const [{ count }] = await sql<{ count: string }[]>`
		SELECT count(*)::text FROM kb_index k
		JOIN documents d ON d.id = k.document_id
		WHERE to_tsvector('english', k.title || ' ' || COALESCE(k.excerpt, ''))
		      @@ plainto_tsquery('english', ${q})
		   OR d.body_search @@ plainto_tsquery('english', ${q})
	`;

	const entries: Entry[] = rows.map((r) => ({
		id: r.id,
		title: r.title,
		excerpt: r.excerpt ?? '',
		snippet: r.snippet?.trim() || undefined,
		type: r.type,
		tags: r.tags,
		author: r.author ?? '',
		created_at: r.created_at.toISOString(),
		updated_at: r.created_at.toISOString(),
		ref_count: 0,
		word_count: r.word_count,
		read_time: Math.ceil(r.word_count / 200),
		recall_source: 'fts'
	}));

	// Augment page 1 with knowledge-graph hits (#53): FTS is lexical, so synonym
	// and paraphrase queries miss. The graph surfaces semantically-related
	// documents FTS didn't. Basic for now — graph hits fill page 1's spare slots
	// after FTS; blended ranking across the full result set is a follow-up.
	let total = parseInt(count);
	if (page === 1 && entries.length < pageSize) {
		const seen = new Set(entries.map((e) => e.id));
		const graphEntries = await graphRecall(q, seen, pageSize - entries.length);
		entries.push(...graphEntries);
		total += graphEntries.length;
	}

	return {
		query: q,
		total,
		duration: `${Date.now() - t0}ms`,
		page,
		page_size: pageSize,
		entries
	};
}

/**
 * Resolve knowledge-graph facts for `q` back to kb entries the FTS pass didn't
 * already return. Graph errors are non-fatal: recall falls back to FTS alone.
 * Entries are ordered by their best (earliest-ranked) supporting fact.
 */
async function graphRecall(q: string, exclude: Set<string>, limit: number): Promise<Entry[]> {
	if (limit <= 0) return [];

	let facts: GraphFact[];
	try {
		facts = await searchGraph(q, Math.max(limit, 10));
	} catch (err) {
		console.error('graph recall failed (non-fatal)', err);
		return [];
	}
	if (facts.length === 0) return [];

	// Rank each episode by the first fact that mentions it (best fact first).
	const episodeRank = new Map<string, number>();
	facts.forEach((f, fi) => {
		for (const uuid of f.episodeUuids) {
			if (!episodeRank.has(uuid)) episodeRank.set(uuid, fi);
		}
	});
	const uuids = [...episodeRank.keys()];
	if (uuids.length === 0) return [];

	const sql = getSql();
	const rows = await sql<
		{
			id: string;
			title: string;
			excerpt: string | null;
			type: string;
			tags: string[];
			author: string | null;
			created_at: Date;
			word_count: number;
			episode_uuid: string;
		}[]
	>`
		SELECT k.id, k.title, k.excerpt, k.type, k.tags, d.author, k.created_at, k.word_count,
		       ge.episode_uuid
		FROM graph_episodes ge
		JOIN kb_index k  ON k.document_id = ge.document_id
		JOIN documents d ON d.id = ge.document_id
		WHERE ge.episode_uuid = ANY(${uuids})
	`;

	rows.sort((a, b) => episodeRank.get(a.episode_uuid)! - episodeRank.get(b.episode_uuid)!);

	const out: Entry[] = [];
	const seen = new Set(exclude);
	for (const r of rows) {
		if (seen.has(r.id)) continue;
		seen.add(r.id);
		out.push({
			id: r.id,
			title: r.title,
			excerpt: r.excerpt ?? '',
			type: r.type,
			tags: r.tags,
			author: r.author ?? '',
			created_at: r.created_at.toISOString(),
			updated_at: r.created_at.toISOString(),
			ref_count: 0,
			word_count: r.word_count,
			read_time: Math.ceil(r.word_count / 200),
			recall_source: 'graph'
		});
		if (out.length >= limit) break;
	}
	return out;
}

export async function getEntry(id: string): Promise<EntryDetail | null> {
	const sql = getSql();

	const rows = await sql<
		{
			id: string;
			title: string;
			excerpt: string | null;
			type: string;
			tags: string[];
			author: string | null;
			created_at: Date;
			word_count: number;
			storage_key: string;
		}[]
	>`
		SELECT k.id, k.title, k.excerpt, k.type, k.tags, d.author, k.created_at, k.word_count,
		       d.storage_key
		FROM kb_index k
		JOIN documents d ON d.id = k.document_id
		WHERE k.id = ${id}
	`;

	if (rows.length === 0) return null;
	const r = rows[0];

	const content = await getDocumentText(r.storage_key);

	const relatedRows = await sql<{ id: string; title: string; excerpt: string | null; type: string }[]>`
		SELECT k2.id, k2.title, k2.excerpt, k2.type
		FROM kb_index k2
		WHERE k2.id != ${id}
		  AND k2.tags && ${r.tags}
		ORDER BY (SELECT count(*)::int FROM unnest(k2.tags) t WHERE t = ANY(${r.tags})) DESC
		LIMIT 4
	`;

	const related: Entry[] = relatedRows.map((rel) => ({
		id: rel.id,
		title: rel.title,
		excerpt: rel.excerpt ?? '',
		type: rel.type,
		tags: [],
		author: '',
		created_at: '',
		updated_at: '',
		ref_count: 0,
		word_count: 0,
		read_time: 0
	}));

	return {
		id: r.id,
		title: r.title,
		excerpt: r.excerpt ?? '',
		type: r.type,
		tags: r.tags,
		author: r.author ?? '',
		created_at: r.created_at.toISOString(),
		updated_at: r.created_at.toISOString(),
		ref_count: 0,
		word_count: r.word_count,
		read_time: Math.ceil(r.word_count / 200),
		content,
		access_level: 'private',
		related
	};
}

export async function getTags(): Promise<Tag[]> {
	const sql = getSql();
	const rows = await sql<{ tag: string; count: string }[]>`
		SELECT unnest(tags) AS tag, count(*)::text AS count
		FROM kb_index
		GROUP BY tag
		ORDER BY count DESC
	`;
	return rows.map((r) => ({ name: r.tag, count: parseInt(r.count) }));
}

export async function getRecent(limit: number): Promise<Entry[]> {
	const sql = getSql();
	const rows = await sql<
		{
			id: string;
			title: string;
			excerpt: string | null;
			type: string;
			author: string | null;
			created_at: Date;
			word_count: number;
		}[]
	>`
		SELECT k.id, k.title, k.excerpt, k.type, d.author, k.created_at, k.word_count
		FROM kb_index k
		JOIN documents d ON d.id = k.document_id
		ORDER BY k.created_at DESC
		LIMIT ${limit}
	`;
	return rows.map((r) => ({
		id: r.id,
		title: r.title,
		excerpt: r.excerpt ?? '',
		type: r.type,
		tags: [],
		author: r.author ?? '',
		created_at: r.created_at.toISOString(),
		updated_at: r.created_at.toISOString(),
		ref_count: 0,
		word_count: r.word_count,
		read_time: Math.ceil(r.word_count / 200)
	}));
}
