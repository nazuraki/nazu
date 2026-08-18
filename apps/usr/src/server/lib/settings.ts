import { getSql } from './db.js';

export type SettingsSection = Record<string, string>;

/** Read every key of a settings section ('' values are treated as unset). */
export async function getSection(section: string): Promise<SettingsSection> {
	const sql = getSql();
	const rows = await sql<{ key: string; value: string }[]>`
		SELECT key, value FROM app_settings WHERE section = ${section}
	`;
	const out: SettingsSection = {};
	for (const row of rows) if (row.value !== '') out[row.key] = row.value;
	return out;
}

/** Upsert the given keys of a section; an empty-string value deletes the key. */
export async function putSection(section: string, values: SettingsSection): Promise<void> {
	const sql = getSql();
	await sql.begin(async (tx) => {
		for (const [key, value] of Object.entries(values)) {
			if (value === '') {
				await tx`DELETE FROM app_settings WHERE section = ${section} AND key = ${key}`;
			} else {
				await tx`
					INSERT INTO app_settings (section, key, value) VALUES (${section}, ${key}, ${value})
					ON CONFLICT (section, key) DO UPDATE SET value = excluded.value
				`;
			}
		}
	});
}
