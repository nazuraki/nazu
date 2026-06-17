import { getSql } from './db.js';

export type Priority = 'high' | 'medium' | null;

export interface OpenTask {
	id: string;
	title: string;
	status: string;
	due_date: string | null;
	priority: Priority;
}

const DAY_MS = 86_400_000;
/** Tasks due within this many days (inclusive) are "medium" priority. */
const SOON_DAYS = 7;

/** Midnight-UTC epoch ms for a Date, so comparisons are date-only (DATE columns
 *  come back as UTC-midnight Dates / `YYYY-MM-DD` strings). */
function dayStart(d: Date): number {
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Derive a display priority for a task. The `tasks` table has no priority
 * column, so we infer one from existing signals:
 *   - blocked, or past its due date → high
 *   - due within the next week       → medium
 *   - otherwise                      → null
 * `now` is injected so the rule is deterministic to test.
 */
export function derivePriority(
	task: { status: string; due_date: string | Date | null },
	now: Date
): Priority {
	if (task.status === 'blocked') return 'high';
	if (!task.due_date) return null;

	const due = new Date(task.due_date);
	if (Number.isNaN(due.getTime())) return null;

	const dueDay = dayStart(due);
	const today = dayStart(now);
	if (dueDay < today) return 'high'; // overdue
	if (dueDay <= today + SOON_DAYS * DAY_MS) return 'medium'; // due soon
	return null;
}

function toDateString(v: string | Date | null): string | null {
	if (!v) return null;
	return v instanceof Date ? v.toISOString().slice(0, 10) : v.slice(0, 10);
}

/**
 * Open, top-level tasks (pending or blocked) ordered for display, each tagged
 * with a derived {@link Priority}. Shared by `/nazu` and `/api/nazu/projects`.
 */
export async function getOpenTasks(now: Date = new Date()): Promise<OpenTask[]> {
	const sql = getSql();
	const rows = await sql<
		{ id: string; description: string; status: string; due_date: string | Date | null }[]
	>`
		SELECT id, description, status, due_date
		FROM tasks
		WHERE status IN ('pending', 'blocked')
		  AND parent_id IS NULL
		ORDER BY sort_order ASC, created_at ASC
	`;

	return rows.map((r) => ({
		id: r.id,
		title: r.description,
		status: r.status,
		due_date: toDateString(r.due_date),
		priority: derivePriority(r, now)
	}));
}
