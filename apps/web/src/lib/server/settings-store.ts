// Thin persistence layer for app_settings rows. Kept separate from the
// settings logic so the latter can be unit-tested with this mocked out.
import { getSql } from './db.js';

export type Config = Record<string, unknown>;

// postgres' json() has a narrow JSONValue parameter type; our config is a plain
// JSON-serializable object, so coerce through the helper's own parameter type.
type JsonArg = Parameters<ReturnType<typeof getSql>['json']>[0];

export async function readRaw(section: string): Promise<Config> {
	const sql = getSql();
	const rows = await sql<{ config: Config }[]>`
		SELECT config FROM app_settings WHERE section = ${section}
	`;
	return rows[0]?.config ?? {};
}

export async function writeRaw(section: string, config: Config): Promise<void> {
	const sql = getSql();
	await sql`
		INSERT INTO app_settings (section, config, updated_at)
		VALUES (${section}, ${sql.json(config as JsonArg)}, now())
		ON CONFLICT (section)
		DO UPDATE SET config = ${sql.json(config as JsonArg)}, updated_at = now()
	`;
}
