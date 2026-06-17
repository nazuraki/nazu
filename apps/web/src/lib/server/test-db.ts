import { createServer } from 'node:net';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';

/**
 * Spin up a throwaway, in-process Postgres for integration tests.
 *
 * PGlite is real Postgres (FTS, GIN, tsvector, ts_headline, LATERAL) compiled to
 * WASM; `pglite-socket` fronts it with the wire protocol so the app's actual
 * porsager `postgres` client connects unmodified — tests exercise the real query
 * strings, not a mock. All project migrations are applied, so the schema matches
 * production. Reusable by any server test that needs a live database.
 */
export interface TestDb {
	/** porsager client, configured exactly as the app's `getSql()` would expect. */
	sql: ReturnType<typeof postgres>;
	/** Tear everything down: close the client, stop the socket, drop the database. */
	stop: () => Promise<void>;
}

const MIGRATIONS_DIR = resolve(process.cwd(), '../../infra/postgres/migrations');

/** Ask the OS for an unused TCP port, so parallel test files never collide. */
function freePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const srv = createServer();
		srv.unref();
		srv.on('error', reject);
		srv.listen(0, '127.0.0.1', () => {
			const addr = srv.address();
			const port = typeof addr === 'object' && addr ? addr.port : 0;
			srv.close(() => resolvePort(port));
		});
	});
}

export async function createTestDb(): Promise<TestDb> {
	const db = await PGlite.create();

	// Apply every migration in filename order, mirroring migrate.ts.
	const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
	for (const file of files) {
		await db.exec(await readFile(resolve(MIGRATIONS_DIR, file), 'utf8'));
	}

	const port = await freePort();
	const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port });
	await server.start();

	// max:1 matches the socket server's single-connection model; prepare:false keeps
	// to unnamed statements, which the socket bridge handles most reliably.
	const sql = postgres({
		host: '127.0.0.1',
		port,
		user: 'postgres',
		database: 'postgres',
		max: 1,
		prepare: false,
		idle_timeout: 1,
		onnotice: () => {}
	});

	return {
		sql,
		stop: async () => {
			await sql.end({ timeout: 5 });
			await server.stop();
			await db.close();
		}
	};
}
