import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { apiGet, apiSend } from "../lib/api.js";
import { closeDb, sql } from "../lib/db.js";

interface Task {
	id: string;
	description: string;
	status: string;
	due_date: string | null;
	sort_order: number;
}

async function clearTasks(): Promise<void> {
	await sql()`TRUNCATE tasks RESTART IDENTITY CASCADE`;
}

async function createTask(description: string): Promise<Task> {
	const res = await apiSend("POST", "/api/tasks", { description });
	expect(res.status).toBe(201);
	return (await res.json()) as Task;
}

describe("/api/tasks", () => {
	beforeEach(async () => {
		await clearTasks();
	});

	afterAll(async () => {
		await closeDb();
	});

	it("returns an empty list when no tasks exist", async () => {
		const res = await apiGet("/api/tasks");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual([]);
	});

	it("creates tasks and assigns increasing sort_order", async () => {
		const a = await createTask("first");
		const b = await createTask("second");
		const c = await createTask("third");

		expect(a.sort_order).toBe(0);
		expect(b.sort_order).toBe(1);
		expect(c.sort_order).toBe(2);
		expect(a.status).toBe("pending");
		expect(a.due_date).toBeNull();
	});

	it("rejects empty descriptions", async () => {
		const empty = await apiSend("POST", "/api/tasks", { description: "" });
		expect(empty.status).toBe(400);

		const whitespace = await apiSend("POST", "/api/tasks", { description: "   " });
		expect(whitespace.status).toBe(400);
	});

	it("lists tasks ordered by sort_order", async () => {
		const a = await createTask("a");
		const b = await createTask("b");
		const c = await createTask("c");

		const res = await apiGet("/api/tasks");
		const list = (await res.json()) as Task[];
		expect(list.map((t) => t.id)).toEqual([a.id, b.id, c.id]);
	});

	it("updates description, status, and due_date", async () => {
		const t = await createTask("original");

		const desc = await apiSend("PATCH", `/api/tasks/${t.id}`, { description: "renamed" });
		expect(desc.status).toBe(200);
		expect((await desc.json() as Task).description).toBe("renamed");

		const status = await apiSend("PATCH", `/api/tasks/${t.id}`, { status: "done" });
		expect((await status.json() as Task).status).toBe("done");

		const due = await apiSend("PATCH", `/api/tasks/${t.id}`, { due_date: "2026-12-31" });
		const dueBody = await due.json() as Task;
		expect(dueBody.due_date).toMatch(/^2026-12-31/);

		const cleared = await apiSend("PATCH", `/api/tasks/${t.id}`, { due_date: null });
		expect((await cleared.json() as Task).due_date).toBeNull();
	});

	it("rejects PATCH with no fields", async () => {
		const t = await createTask("x");
		const res = await apiSend("PATCH", `/api/tasks/${t.id}`, {});
		expect(res.status).toBe(400);
	});

	it("rejects PATCH that blanks the description", async () => {
		const t = await createTask("x");
		const res = await apiSend("PATCH", `/api/tasks/${t.id}`, { description: "   " });
		expect(res.status).toBe(400);
	});

	it("returns 404 for PATCH/DELETE on unknown id", async () => {
		const fakeId = "00000000-0000-0000-0000-000000000000";
		const patch = await apiSend("PATCH", `/api/tasks/${fakeId}`, { status: "done" });
		expect(patch.status).toBe(404);

		const del = await apiSend("DELETE", `/api/tasks/${fakeId}`);
		expect(del.status).toBe(404);
	});

	it("deletes a task", async () => {
		const t = await createTask("ephemeral");

		const del = await apiSend("DELETE", `/api/tasks/${t.id}`);
		expect(del.status).toBe(204);

		const list = (await (await apiGet("/api/tasks")).json()) as Task[];
		expect(list).toHaveLength(0);
	});

	it("reorders tasks via /api/tasks/reorder", async () => {
		const a = await createTask("a");
		const b = await createTask("b");
		const c = await createTask("c");

		const reordered = await apiSend("POST", "/api/tasks/reorder", {
			ids: [c.id, a.id, b.id],
		});
		expect(reordered.status).toBe(200);

		const list = (await (await apiGet("/api/tasks")).json()) as Task[];
		expect(list.map((t) => t.id)).toEqual([c.id, a.id, b.id]);
		expect(list.map((t) => t.sort_order)).toEqual([0, 1, 2]);
	});

	it("rejects reorder with bad payload", async () => {
		const res = await apiSend("POST", "/api/tasks/reorder", { ids: "nope" });
		expect(res.status).toBe(400);
	});
});

describe("schema_migrations", () => {
	afterAll(async () => {
		await closeDb();
	});

	it("records both migrations as applied", async () => {
		const rows = await sql()<{ filename: string }[]>`
			SELECT filename FROM schema_migrations ORDER BY filename
		`;
		expect(rows.map((r) => r.filename)).toEqual([
			"001_init.sql",
			"002_task_sort_order.sql",
		]);
	});
});
