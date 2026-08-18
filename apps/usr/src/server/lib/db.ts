import postgres from 'postgres';

let _sql: ReturnType<typeof postgres> | undefined;

// Default targets the compose-internal postgres service so a fresh
// `docker compose up` works with no env config. Override DATABASE_URL for
// non-standard setups (e.g. local dev against the published host port).
const DEFAULT_DATABASE_URL = 'postgres://usr:usr@postgres:5432/usr';

export function getSql(): ReturnType<typeof postgres> {
	if (!_sql) {
		_sql = postgres(process.env.DATABASE_URL || DEFAULT_DATABASE_URL, { max: 5 });
	}
	return _sql;
}

/** Test hook: point the module at a different database (closes any prior pool). */
export async function setSqlForTests(sql: ReturnType<typeof postgres> | undefined): Promise<void> {
	if (_sql && _sql !== sql) await _sql.end({ timeout: 1 });
	_sql = sql;
}
