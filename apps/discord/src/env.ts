// Bootstrap config from the environment. Everything else (bot token, watched
// channels, enabled flag) is DB-backed and fetched from the web app at runtime
// — see config.ts. A fresh deploy needs only these two, and NAZU_API_KEY only
// when the web app isn't in zero-conf open mode.

/** Base URL of the nazu web app (compose-internal). */
export const NAZU_URL = (process.env.NAZU_URL ?? 'http://web:3000').replace(/\/+$/, '');

const API_KEY = process.env.NAZU_API_KEY?.trim() ?? '';

/** Auth headers for the nazu REST API: a Bearer key when one is configured, none
 *  in zero-conf (open LAN) mode. */
export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
	return API_KEY ? { Authorization: `Bearer ${API_KEY}`, ...extra } : { ...extra };
}
