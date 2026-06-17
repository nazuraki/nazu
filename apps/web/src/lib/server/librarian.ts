import { getSql } from './db.js';
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
		read_time: Math.ceil(r.word_count / 200)
	}));

	return {
		query: q,
		total: parseInt(count),
		duration: `${Date.now() - t0}ms`,
		page,
		page_size: pageSize,
		entries
	};
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
