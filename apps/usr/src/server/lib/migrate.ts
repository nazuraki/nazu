import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { getSql } from './db.js';

const DEFAULT_DIR = resolve(process.cwd(), 'migrations');

/** Apply pending .sql migrations in order; tracked in schema_migrations. */
export async function runMigrations(): Promise<void> {
	const dir = process.env.MIGRATIONS_DIR || DEFAULT_DIR;
	const sql = getSql();

	await sql`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			filename   TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)
	`;

	const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

	const applied = new Set(
		(await sql<{ filename: string }[]>`SELECT filename FROM schema_migrations`).map(
			(r) => r.filename,
		),
	);

	for (const file of files) {
		if (applied.has(file)) continue;
		const body = await readFile(resolve(dir, file), 'utf8');
		console.log(`[migrate] applying ${file}`);
		try {
			await sql.begin(async (tx) => {
				await tx.unsafe(body).simple();
				await tx`INSERT INTO schema_migrations (filename) VALUES (${file})`;
			});
		} catch (e) {
			console.error(`[migrate] FAILED ${file}:`, e);
			throw e;
		}
	}
}
