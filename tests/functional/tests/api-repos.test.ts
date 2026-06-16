import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { apiGet } from "../lib/api.js";
import { closeDb } from "../lib/db.js";
import { getCalls, resetMocks, setFixture } from "../lib/mocks.js";

// Matches the GITHUB_USER / GITHUB_ORG values set in docker-compose.test.override.yml.
const USER = "testuser";
const ORG = "testorg";

describe("/api/repos", () => {
	beforeEach(async () => {
		await resetMocks();
	});

	afterAll(async () => {
		await closeDb();
	});

	it("merges personal and org repos from GitHub, sorted by full_name", async () => {
		await setFixture("github", {
			method: "GET",
			path: "/user/repos",
			status: 200,
			body: [{ id: 1, name: "alpha", full_name: `${USER}/alpha` }],
		});
		await setFixture("github", {
			method: "GET",
			path: `/orgs/${ORG}/repos`,
			status: 200,
			body: [{ id: 2, name: "beta", full_name: `${ORG}/beta` }],
		});

		const res = await apiGet("/api/repos");
		expect(res.status).toBe(200);

		const body = (await res.json()) as { repos: { full_name: string }[]; stale: boolean };
		expect(body.stale).toBe(false);
		expect(body.repos.map((r) => r.full_name)).toEqual([`${ORG}/beta`, `${USER}/alpha`]);

		const calls = await getCalls("github");
		const paths = calls.map((c) => c.path).sort();
		expect(paths).toEqual(["/orgs/testorg/repos", "/user/repos"]);
	});

	it("excludes archived repos from both user and org results", async () => {
		await setFixture("github", {
			method: "GET",
			path: "/user/repos",
			status: 200,
			body: [
				{ id: 1, name: "alpha", full_name: `${USER}/alpha`, archived: false },
				{ id: 2, name: "old", full_name: `${USER}/old`, archived: true },
			],
		});
		await setFixture("github", {
			method: "GET",
			path: `/orgs/${ORG}/repos`,
			status: 200,
			body: [
				{ id: 3, name: "beta", full_name: `${ORG}/beta`, archived: false },
				{ id: 4, name: "legacy", full_name: `${ORG}/legacy`, archived: true },
			],
		});

		const res = await apiGet("/api/repos");
		expect(res.status).toBe(200);

		const body = (await res.json()) as { repos: { full_name: string }[]; stale: boolean };
		expect(body.stale).toBe(false);
		expect(body.repos.map((r) => r.full_name)).toEqual([`${ORG}/beta`, `${USER}/alpha`]);
	});

	it("degrades gracefully (200 + stale) instead of 500 when a GitHub call fails", async () => {
		await setFixture("github", {
			method: "GET",
			path: "/user/repos",
			status: 500,
			body: { message: "boom" },
		});
		await setFixture("github", {
			method: "GET",
			path: `/orgs/${ORG}/repos`,
			status: 200,
			body: [],
		});

		const res = await apiGet("/api/repos");
		// A transient GitHub failure must never 500 the dashboard (issue #48).
		expect(res.status).toBe(200);

		const body = (await res.json()) as { repos: unknown[]; stale: boolean; error: string | null };
		expect(body.stale).toBe(true);
		expect(body.error).toBeTruthy();
		expect(Array.isArray(body.repos)).toBe(true);
	});
});
