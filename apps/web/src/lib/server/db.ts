import { env } from '$env/dynamic/private';
import postgres from 'postgres';

let _sql: ReturnType<typeof postgres> | undefined;

export function getSql(): ReturnType<typeof postgres> {
	if (!_sql) {
		const url = env.DATABASE_URL;
		if (!url) throw new Error("DATABASE_URL environment variable is not set");
		_sql = postgres(url, { max: 5 });
	}
	return _sql;
}
