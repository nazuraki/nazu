import { NAZU_URL, authHeaders } from './env.js';

/** Runtime config for the bot, served by the web app's GET /api/discord/config. */
export interface BotConfig {
	enabled: boolean;
	botToken: string;
	channels: string[];
	statusReactions: boolean;
}

/**
 * Pull the bot's config from the web app. `fetchImpl` is injectable for tests.
 * Throws on transport/HTTP failure — the caller retries on the next poll tick
 * rather than crashing the process.
 */
export async function fetchConfig(fetchImpl: typeof fetch = fetch): Promise<BotConfig> {
	const res = await fetchImpl(`${NAZU_URL}/api/discord/config`, { headers: authHeaders() });
	if (!res.ok) throw new Error(`config fetch failed: HTTP ${res.status}`);

	const raw = (await res.json()) as Partial<BotConfig>;
	return {
		enabled: Boolean(raw.enabled),
		botToken: typeof raw.botToken === 'string' ? raw.botToken : '',
		channels: Array.isArray(raw.channels)
			? raw.channels.filter((c): c is string => typeof c === 'string')
			: [],
		// Default-on: only an explicit `false` disables reactions.
		statusReactions: raw.statusReactions !== false,
	};
}
