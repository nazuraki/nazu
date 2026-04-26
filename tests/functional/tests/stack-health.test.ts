import { describe, it, expect } from "vitest";
import { MOCKS_URL, WEB_URL } from "../lib/endpoints.js";
import { sql } from "../lib/db.js";
import { readStartupLogs } from "../lib/logs.js";

const ERROR_PATTERN = /\b(error|fatal|panic|unhandled)\b/i;
// Postgres logs " LOG:  database system was shut down" etc. — only flag actual error/fatal levels.
const PG_ERROR_PATTERN = /\b(FATAL|ERROR|PANIC):/;

describe("stack health", () => {
	it("postgres is reachable", async () => {
		const rows = await sql()`SELECT 1 AS one`;
		expect(rows[0].one).toBe(1);
	});

	it("postgres startup logs are clean", () => {
		expect(readStartupLogs("postgres")).not.toMatch(PG_ERROR_PATTERN);
	});

	it("falkordb startup logs are clean", () => {
		expect(readStartupLogs("falkordb")).not.toMatch(ERROR_PATTERN);
	});

	it("mocks startup logs are clean", () => {
		expect(readStartupLogs("mocks")).not.toMatch(ERROR_PATTERN);
	});

	it("web startup logs are clean", () => {
		expect(readStartupLogs("web")).not.toMatch(ERROR_PATTERN);
	});

	it("mocks service responds to admin health", async () => {
		const res = await fetch(`${MOCKS_URL}/__admin__/health`);
		expect(res.ok).toBe(true);
		expect(await res.json()).toEqual({ ok: true });
	});

	it("web service responds", async () => {
		const res = await fetch(WEB_URL);
		expect(res.status).toBeLessThan(500);
	});
});
