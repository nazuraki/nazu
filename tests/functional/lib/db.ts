import postgres from "postgres";
import { POSTGRES_URL } from "./endpoints.js";

let _sql: ReturnType<typeof postgres> | null = null;

export function sql() {
	if (!_sql) _sql = postgres(POSTGRES_URL, { max: 4 });
	return _sql;
}

export async function truncateAll(): Promise<void> {
	const s = sql();
	const tables = await s<{ tablename: string }[]>`
		SELECT tablename FROM pg_tables
		WHERE schemaname = 'public'
	`;
	if (tables.length === 0) return;
	const list = tables.map((t) => `"${t.tablename}"`).join(", ");
	await s.unsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

export async function closeDb(): Promise<void> {
	if (_sql) {
		await _sql.end({ timeout: 2 });
		_sql = null;
	}
}
