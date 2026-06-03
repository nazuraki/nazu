import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { apiGet, apiSend } from "../lib/api.js";
import { closeDb, sql } from "../lib/db.js";

interface Task {
	id: string;
	description: string;
	status: string;
	due_date: string | null;
	completion_date: string | null;
	parent_id: string | null;
	sort_order: number;
}

async function clearTasks(): Promise<void> {
	await sql()`TRUNCATE tasks RESTART IDENTITY CASCADE`;
}

async function createTask(
	description: string,
	extra: { parent_id?: string; status?: string } = {},
): Promise<Task> {
	const res = await apiSend("POST", "/api/tasks", { description, ...extra });
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
		expect(a.parent_id).toBeNull();
		expect(a.completion_date).toBeNull();
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

describe("/api/tasks — subtasks, status enum, notes", () => {
	beforeEach(async () => {
		await clearTasks();
	});

	afterAll(async () => {
		await closeDb();
	});

	it("creates a subtask with parent_id and inherits a sibling-scoped sort_order", async () => {
		const parent = await createTask("parent");
		const a = await createTask("child a", { parent_id: parent.id });
		const b = await createTask("child b", { parent_id: parent.id });
		const top = await createTask("another top");

		expect(a.parent_id).toBe(parent.id);
		expect(b.parent_id).toBe(parent.id);
		expect(a.sort_order).toBe(0);
		expect(b.sort_order).toBe(1);
		// Top-level sort_order is independent of subtask sort_order
		expect(parent.sort_order).toBe(0);
		expect(top.sort_order).toBe(1);
	});

	it("rejects POST with a parent_id that doesn't exist", async () => {
		const res = await apiSend("POST", "/api/tasks", {
			description: "orphan",
			parent_id: "00000000-0000-0000-0000-000000000000",
		});
		expect(res.status).toBe(400);
	});

	it("rejects POST with an invalid status", async () => {
		const res = await apiSend("POST", "/api/tasks", {
			description: "x",
			status: "in_progress",
		});
		expect(res.status).toBe(400);
	});

	it("rejects PATCH with an invalid status", async () => {
		const t = await createTask("x");
		const res = await apiSend("PATCH", `/api/tasks/${t.id}`, { status: "wat" });
		expect(res.status).toBe(400);
	});

	it("rejects making a task its own parent", async () => {
		const t = await createTask("x");
		const res = await apiSend("PATCH", `/api/tasks/${t.id}`, { parent_id: t.id });
		expect(res.status).toBe(400);
	});

	it("creates notes with status=note", async () => {
		const t = await createTask("a memo", { status: "note" });
		expect(t.status).toBe("note");
	});

	it("auto-stamps completion_date when status flips to done, and clears it on un-done", async () => {
		const t = await createTask("x");
		expect(t.completion_date).toBeNull();

		const done = await apiSend("PATCH", `/api/tasks/${t.id}`, { status: "done" });
		const doneBody = (await done.json()) as Task;
		expect(doneBody.status).toBe("done");
		expect(doneBody.completion_date).toMatch(/^\d{4}-\d{2}-\d{2}/);

		const undone = await apiSend("PATCH", `/api/tasks/${t.id}`, { status: "pending" });
		const undoneBody = (await undone.json()) as Task;
		expect(undoneBody.status).toBe("pending");
		expect(undoneBody.completion_date).toBeNull();
	});

	it("respects an explicit completion_date in the same PATCH", async () => {
		const t = await createTask("x");
		const res = await apiSend("PATCH", `/api/tasks/${t.id}`, {
			status: "done",
			completion_date: "2025-01-15",
		});
		const body = (await res.json()) as Task;
		expect(body.completion_date).toMatch(/^2025-01-15/);
	});

	it("auto-stamps completion_date when a task is created with status=done", async () => {
		const t = await createTask("already done", { status: "done" });
		expect(t.completion_date).toMatch(/^\d{4}-\d{2}-\d{2}/);
	});

	it("does not stamp completion_date for non-done statuses (note, blocked)", async () => {
		const note = await createTask("a memo", { status: "note" });
		expect(note.completion_date).toBeNull();

		const t = await createTask("x");
		const blocked = await apiSend("PATCH", `/api/tasks/${t.id}`, { status: "blocked" });
		expect(((await blocked.json()) as Task).completion_date).toBeNull();
	});

	it("cascades delete from parent to subtasks", async () => {
		const parent = await createTask("parent");
		const child = await createTask("child", { parent_id: parent.id });
		const sibling = await createTask("unrelated");

		const del = await apiSend("DELETE", `/api/tasks/${parent.id}`);
		expect(del.status).toBe(204);

		const list = (await (await apiGet("/api/tasks")).json()) as Task[];
		const ids = list.map((t) => t.id);
		expect(ids).toContain(sibling.id);
		expect(ids).not.toContain(parent.id);
		expect(ids).not.toContain(child.id);
	});

	it("rejects status values not in the enum at the DB layer", async () => {
		// Belt-and-suspenders: the API rejects first, but the CHECK constraint must hold too.
		const res = sql()`INSERT INTO tasks (description, status) VALUES ('x', 'bogus')`;
		await expect(res).rejects.toThrow();
	});
});

describe("/api/nazu/projects — dashboard task feed", () => {
	beforeEach(async () => {
		await clearTasks();
	});

	afterAll(async () => {
		await closeDb();
	});

	it("returns only top-level pending and blocked tasks", async () => {
		const pending = await createTask("pending top");
		const parent = await createTask("parent");
		await createTask("child", { parent_id: parent.id }); // subtask should be hidden
		await createTask("done top", { status: "done" });
		await createTask("note top", { status: "note" });
		const blocked = await createTask("blocked top");
		await apiSend("PATCH", `/api/tasks/${blocked.id}`, { status: "blocked" });

		const res = await apiGet("/api/nazu/projects");
		expect(res.status).toBe(200);
		const groups = (await res.json()) as { topic: string; tasks: { id: string; title: string }[] }[];
		expect(groups).toHaveLength(1);
		expect(groups[0].topic).toBe("tasks");

		const ids = groups[0].tasks.map((t) => t.id).sort();
		expect(ids).toEqual([pending.id, parent.id, blocked.id].sort());
	});

	it("returns an empty array when nothing matches", async () => {
		await createTask("done", { status: "done" });
		await createTask("note", { status: "note" });

		const res = await apiGet("/api/nazu/projects");
		expect(await res.json()).toEqual([]);
	});
});

describe("schema_migrations", () => {
	afterAll(async () => {
		await closeDb();
	});

	it("records all migrations as applied", async () => {
		const rows = await sql()<{ filename: string }[]>`
			SELECT filename FROM schema_migrations ORDER BY filename
		`;
		expect(rows.map((r) => r.filename)).toEqual([
			"001_init.sql",
			"002_task_sort_order.sql",
			"003_subtasks_and_notes.sql",
			"004_documents.sql",
			"005_kb_index.sql",
			"006_service_config.sql",
		]);
	});
});
