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

		const body = (await res.json()) as { full_name: string }[];
		expect(body.map((r) => r.full_name)).toEqual([`${ORG}/beta`, `${USER}/alpha`]);

		const calls = await getCalls("github");
		const paths = calls.map((c) => c.path).sort();
		expect(paths).toEqual(["/orgs/testorg/repos", "/user/repos"]);
	});

	it("returns 500 when a GitHub call fails", async () => {
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
		expect(res.status).toBe(500);
	});
});
