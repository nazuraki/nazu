import { env } from '$env/dynamic/private';
import postgres from 'postgres';

let _sql: ReturnType<typeof postgres> | undefined;

// Default targets the Compose-internal postgres service so a fresh
// `docker compose up` works with no env config. Override DATABASE_URL for
// non-standard setups.
const DEFAULT_DATABASE_URL = 'postgres://nazu:nazu@postgres:5432/nazu';

export function getSql(): ReturnType<typeof postgres> {
	if (!_sql) {
		_sql = postgres(env.DATABASE_URL || DEFAULT_DATABASE_URL, { max: 5 });
	}
	return _sql;
}
