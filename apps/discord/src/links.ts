// URL run: everything up to whitespace or an angle bracket (Discord wraps
// link-preview-suppressed URLs as <https://…>).
const URL_RE = /https?:\/\/[^\s<>]+/gi;

// Hosts the bot acts on. Anything else is left for the web app to reject, so we
// don't spam /api/ingest/url with every link people post.
const WATCH_HOSTS = [/(^|\.)youtube\.com$/, /(^|\.)youtu\.be$/, /(^|\.)tiktok\.com$/];

/**
 * Extract de-duplicated YouTube/TikTok URLs from a message body. Trailing
 * punctuation that commonly abuts a pasted link is trimmed before parsing.
 */
export function extractWatchableLinks(content: string): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const match of content.matchAll(URL_RE)) {
		const raw = match[0].replace(/[)>\].,!?]+$/, '');
		let host: string;
		try {
			host = new URL(raw).hostname.toLowerCase();
		} catch {
			continue;
		}
		if (!WATCH_HOSTS.some((re) => re.test(host))) continue;
		if (seen.has(raw)) continue;
		seen.add(raw);
		out.push(raw);
	}
	return out;
}
