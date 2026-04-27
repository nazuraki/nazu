import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { apiGet, apiSend } from "../lib/api.js";
import { closeDb, sql } from "../lib/db.js";
import { WEB_URL } from "../lib/endpoints.js";

interface IngestResult {
	id: string;
	title: string;
}

interface Entry {
	id: string;
	title: string;
	type: string;
	tags: string[];
	excerpt: string;
	word_count: number;
}

interface EntryDetail extends Entry {
	content: string;
	author: string;
	related: Entry[];
}

interface SearchResponse {
	total: number;
	entries: Entry[];
}

async function clearKb(): Promise<void> {
	await sql()`TRUNCATE documents CASCADE`;
}

async function ingest(
	title: string,
	content: string,
	extra: { type?: string; tags?: string; author?: string; source_url?: string } = {},
): Promise<IngestResult> {
	const res = await apiSend("POST", "/api/ingest", { title, content, ...extra });
	expect(res.status).toBe(201);
	return (await res.json()) as IngestResult;
}

describe("/api/ingest", () => {
	beforeEach(clearKb);
	afterAll(closeDb);

	it("creates a document and returns id + title", async () => {
		const result = await ingest("Test Document", "Some content here.");
		expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
		expect(result.title).toBe("Test Document");
	});

	it("persists the entry in kb_index", async () => {
		const result = await ingest("Persisted Doc", "content to check");
		const rows = await sql()<{ id: string }[]>`SELECT id FROM kb_index WHERE id = ${result.id}`;
		expect(rows).toHaveLength(1);
	});

	it("rejects missing title", async () => {
		const res = await apiSend("POST", "/api/ingest", { content: "body" });
		expect(res.status).toBe(400);
	});

	it("rejects whitespace-only title", async () => {
		const res = await apiSend("POST", "/api/ingest", { title: "   ", content: "body" });
		expect(res.status).toBe(400);
	});

	it("rejects missing content", async () => {
		const res = await apiSend("POST", "/api/ingest", { title: "title" });
		expect(res.status).toBe(400);
	});

	it("rejects invalid JSON", async () => {
		const res = await fetch(`${WEB_URL}/api/ingest`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "not-json",
		});
		expect(res.status).toBe(400);
	});

	it("stores tags normalised to lowercase", async () => {
		const result = await ingest("Tagged Doc", "content", { tags: "AI, Research, Tools" });
		const rows = await sql()<{ tags: string[] }[]>`SELECT tags FROM kb_index WHERE id = ${result.id}`;
		expect(rows[0].tags).toEqual(expect.arrayContaining(["ai", "research", "tools"]));
	});

	it("stores the specified type", async () => {
		const result = await ingest("An Article", "content", { type: "article" });
		const rows = await sql()<{ type: string }[]>`SELECT type FROM kb_index WHERE id = ${result.id}`;
		expect(rows[0].type).toBe("article");
	});

	it("defaults type to 'note' when omitted", async () => {
		const result = await ingest("A Note", "content");
		const rows = await sql()<{ type: string }[]>`SELECT type FROM kb_index WHERE id = ${result.id}`;
		expect(rows[0].type).toBe("note");
	});

	it("records a non-zero word count", async () => {
		const result = await ingest("Word Count Test", "one two three four five");
		const rows = await sql()<{ word_count: number }[]>`SELECT word_count FROM kb_index WHERE id = ${result.id}`;
		expect(rows[0].word_count).toBeGreaterThan(0);
	});
});

describe("/api/entries/[id]", () => {
	beforeEach(clearKb);
	afterAll(closeDb);

	it("returns entry detail with content from storage", async () => {
		const result = await ingest("Detail Test", "Full article body here.", { type: "article" });
		const res = await apiGet(`/api/entries/${result.id}`);
		expect(res.status).toBe(200);
		const detail = (await res.json()) as EntryDetail;
		expect(detail.id).toBe(result.id);
		expect(detail.title).toBe("Detail Test");
		expect(detail.type).toBe("article");
		expect(detail.content).toContain("Full article body here.");
	});

	it("returns 404 for unknown id", async () => {
		const res = await apiGet("/api/entries/00000000-0000-0000-0000-000000000000");
		expect(res.status).toBe(404);
	});

	it("includes related entries that share tags", async () => {
		const a = await ingest("Entry A", "content", { tags: "ml, ai" });
		const b = await ingest("Entry B", "content", { tags: "ml, tools" });

		const res = await apiGet(`/api/entries/${a.id}`);
		const detail = (await res.json()) as EntryDetail;
		const relatedIds = detail.related.map((r) => r.id);
		expect(relatedIds).toContain(b.id);
	});
});

describe("/api/search", () => {
	beforeEach(clearKb);
	afterAll(closeDb);

	it("finds entries matching the query against title", async () => {
		const result = await ingest("Distributed Systems Overview", "content about raft consensus");
		const res = await apiGet("/api/search?q=distributed");
		expect(res.status).toBe(200);
		const body = (await res.json()) as SearchResponse;
		expect(body.entries.map((e) => e.id)).toContain(result.id);
		expect(body.total).toBeGreaterThanOrEqual(1);
	});

	it("returns empty results when nothing matches", async () => {
		await ingest("Some Document", "content about ordinary things");
		const res = await apiGet("/api/search?q=xyzzyunmatchable");
		const body = (await res.json()) as SearchResponse;
		expect(body.entries).toHaveLength(0);
		expect(body.total).toBe(0);
	});

	it("returns 400 when q is missing", async () => {
		const res = await apiGet("/api/search");
		expect(res.status).toBe(400);
	});
});

describe("/api/recent", () => {
	beforeEach(clearKb);
	afterAll(closeDb);

	it("returns recently ingested entries in reverse-chronological order", async () => {
		const a = await ingest("First Entry", "content a");
		const b = await ingest("Second Entry", "content b");
		const c = await ingest("Third Entry", "content c");

		const res = await apiGet("/api/recent");
		expect(res.status).toBe(200);
		const list = (await res.json()) as Entry[];
		const ids = list.map((e) => e.id);
		expect(ids).toContain(a.id);
		expect(ids).toContain(b.id);
		expect(ids).toContain(c.id);
		// Most recent first
		expect(ids.indexOf(c.id)).toBeLessThan(ids.indexOf(a.id));
	});

	it("respects the limit parameter", async () => {
		await ingest("Entry 1", "content");
		await ingest("Entry 2", "content");
		await ingest("Entry 3", "content");

		const res = await apiGet("/api/recent?limit=2");
		const list = (await res.json()) as Entry[];
		expect(list).toHaveLength(2);
	});
});

describe("/api/tags", () => {
	beforeEach(clearKb);
	afterAll(closeDb);

	it("aggregates tags across all entries with counts", async () => {
		await ingest("Doc A", "content", { tags: "ml, research" });
		await ingest("Doc B", "content", { tags: "ml, tools" });
		await ingest("Doc C", "content", { tags: "research" });

		const res = await apiGet("/api/tags");
		expect(res.status).toBe(200);
		const tags = (await res.json()) as { name: string; count: number }[];

		const ml = tags.find((t) => t.name === "ml");
		const research = tags.find((t) => t.name === "research");
		expect(ml?.count).toBe(2);
		expect(research?.count).toBe(2);
		expect(tags.map((t) => t.name)).toContain("tools");
	});

	it("returns an empty array when no entries exist", async () => {
		const res = await apiGet("/api/tags");
		expect(await res.json()).toEqual([]);
	});
});
