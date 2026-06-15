import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { apiGet, apiSend } from "../lib/api.js";
import { closeDb, sql } from "../lib/db.js";

interface RememberResult {
	id: string;
	title: string;
}

interface Entry {
	id: string;
	title: string;
	type: string;
	tags: string[];
}

interface SearchResponse {
	total: number;
	entries: Entry[];
}

async function clearKb(): Promise<void> {
	await sql()`TRUNCATE documents CASCADE`;
}

describe("/api/remember", () => {
	beforeEach(clearKb);
	afterAll(closeDb);

	it("stores content and returns id + title", async () => {
		const res = await apiSend("POST", "/api/remember", {
			content: "Raft is a consensus algorithm.",
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as RememberResult;
		expect(body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
		expect(body.title).toBe("Raft is a consensus algorithm.");
	});

	it("derives a title from the first line when omitted", async () => {
		const res = await apiSend("POST", "/api/remember", {
			content: "# Project Nazu\n\nA self-hosted second brain.",
		});
		const body = (await res.json()) as RememberResult;
		expect(body.title).toBe("Project Nazu");
	});

	it("round-trips: a remembered fact is found via recall (search)", async () => {
		const r = await apiSend("POST", "/api/remember", {
			content: "Photosynthesis converts light into chemical energy.",
			tags: ["biology"],
		});
		const { id } = (await r.json()) as RememberResult;

		const res = await apiGet("/api/search?q=photosynthesis");
		expect(res.status).toBe(200);
		const body = (await res.json()) as SearchResponse;
		expect(body.entries.map((e) => e.id)).toContain(id);
	});

	it("normalizes array tags to lowercase", async () => {
		const r = await apiSend("POST", "/api/remember", {
			content: "a tagged note",
			tags: ["AI", "Research"],
		});
		const { id } = (await r.json()) as RememberResult;
		const rows = await sql()<{ tags: string[] }[]>`SELECT tags FROM kb_index WHERE id = ${id}`;
		expect(rows[0].tags).toEqual(expect.arrayContaining(["ai", "research"]));
	});

	it("defaults type to 'note' when omitted", async () => {
		const r = await apiSend("POST", "/api/remember", { content: "some content" });
		const { id } = (await r.json()) as RememberResult;
		const rows = await sql()<{ type: string }[]>`SELECT type FROM kb_index WHERE id = ${id}`;
		expect(rows[0].type).toBe("note");
	});

	it("rejects missing content", async () => {
		const res = await apiSend("POST", "/api/remember", { tags: ["x"] });
		expect(res.status).toBe(400);
	});

	it("rejects invalid JSON", async () => {
		const res = await fetch("http://localhost:3001/api/remember", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "not-json",
		});
		expect(res.status).toBe(400);
	});
});
