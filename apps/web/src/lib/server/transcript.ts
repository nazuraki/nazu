import { YoutubeTranscript } from 'youtube-transcript';

/** Platforms whose links the Discord bot watches for and the URL ingest path
 *  knows how to fetch a transcript from. */
export type Platform = 'youtube' | 'tiktok';

export interface ClassifiedUrl {
	platform: Platform;
	/** Stable identifier for the media (YouTube video id; TikTok video id or
	 *  short-link code). */
	id: string;
	/** Canonical URL used for storage + dedup. All forms of the same media
	 *  normalize to one value. */
	url: string;
}

/** A fetched transcript, shaped for {@link import('./ingest.js').storeDocument}. */
export interface TranscriptResult {
	status: 'ok';
	platform: Platform;
	title: string;
	author: string | null;
	/** Plain-text transcript body. */
	text: string;
	/** Canonical source URL. */
	url: string;
}

/** Outcome of {@link fetchTranscript}: a transcript, or a structured reason it
 *  could not be produced. `unsupported` = unrecognized link; `unavailable` =
 *  recognized platform but no transcript (captions off, stub, network error). */
export type FetchOutcome =
	| TranscriptResult
	| { status: 'unsupported' }
	| { status: 'unavailable'; platform: Platform; reason: string };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** Strip a leading `www.`/`m.`/`music.` label so host matching is uniform. */
function bareHost(host: string): string {
	return host.toLowerCase().replace(/^(www|m|music)\./, '');
}

/** Pull a YouTube video id out of any of its URL shapes, or null. */
function youtubeId(u: URL): string | null {
	const host = bareHost(u.hostname);
	if (host === 'youtu.be') {
		const id = u.pathname.split('/').filter(Boolean)[0];
		return id && YOUTUBE_ID.test(id) ? id : null;
	}
	if (host === 'youtube.com') {
		const v = u.searchParams.get('v');
		if (v && YOUTUBE_ID.test(v)) return v;
		// /shorts/<id>, /embed/<id>, /live/<id>, /v/<id>
		const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/);
		return m ? m[1] : null;
	}
	return null;
}

/** Pull a TikTok video id (or short-link code) out of a URL, or null. */
function tiktokId(u: URL): string | null {
	const host = bareHost(u.hostname);
	if (host === 'tiktok.com') {
		const m = u.pathname.match(/\/video\/(\d+)/);
		if (m) return m[1];
		// /@user with no /video/ segment isn't an ingestible post.
		return null;
	}
	if (host === 'vm.tiktok.com' || host === 'vt.tiktok.com') {
		const code = u.pathname.split('/').filter(Boolean)[0];
		return code || null;
	}
	return null;
}

/**
 * Classify a URL as a supported media link, or null when it isn't one we know
 * how to ingest. Normalizes to a canonical URL so the same video posted in
 * different forms dedupes to one entry.
 */
export function classifyUrl(raw: string): ClassifiedUrl | null {
	let u: URL;
	try {
		u = new URL(raw.trim());
	} catch {
		return null;
	}
	if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

	const yt = youtubeId(u);
	if (yt) return { platform: 'youtube', id: yt, url: `https://www.youtube.com/watch?v=${yt}` };

	const tt = tiktokId(u);
	if (tt) {
		// Drop tracking query/fragment; short links keep their code in the path.
		return { platform: 'tiktok', id: tt, url: `${u.origin}${u.pathname}` };
	}
	return null;
}

/** Decode the handful of HTML entities that leak through caption text. */
function decodeEntities(s: string): string {
	return s
		.replace(/&amp;/g, '&')
		.replace(/&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

interface OEmbed {
	title?: string;
	author_name?: string;
}

/** Best-effort YouTube title + channel via the public oEmbed endpoint (no API
 *  key). Returns nulls on any failure — the transcript is the critical part. */
async function youtubeMeta(url: string): Promise<{ title: string | null; author: string | null }> {
	try {
		const res = await fetch(
			`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
			{ signal: AbortSignal.timeout(10_000) },
		);
		if (!res.ok) return { title: null, author: null };
		const data = (await res.json()) as OEmbed;
		return { title: data.title ?? null, author: data.author_name ?? null };
	} catch {
		return { title: null, author: null };
	}
}

/** Fetch a YouTube transcript via the (unofficial) caption endpoint, plus oEmbed
 *  metadata for the title/author. */
async function fetchYoutube(c: ClassifiedUrl): Promise<FetchOutcome> {
	let segments: { text: string }[];
	try {
		segments = await YoutubeTranscript.fetchTranscript(c.id);
	} catch (err) {
		return {
			status: 'unavailable',
			platform: 'youtube',
			reason: `no transcript available (${(err as Error).message})`,
		};
	}
	const text = decodeEntities(segments.map((s) => s.text).join(' ')).replace(/\s+/g, ' ').trim();
	if (!text) {
		return { status: 'unavailable', platform: 'youtube', reason: 'transcript was empty' };
	}
	const meta = await youtubeMeta(c.url);
	return {
		status: 'ok',
		platform: 'youtube',
		title: meta.title?.trim() || `YouTube video ${c.id}`,
		author: meta.author,
		text,
		url: c.url,
	};
}

/** TikTok has no official captions API and scraping is flaky/low-yield, so this
 *  is a deliberate stub behind the same seam (#34). A real fetcher drops in
 *  here later without touching callers. */
async function fetchTiktok(_c: ClassifiedUrl): Promise<FetchOutcome> {
	return {
		status: 'unavailable',
		platform: 'tiktok',
		reason: 'TikTok transcript fetching is not yet implemented',
	};
}

const FETCHERS: Record<Platform, (c: ClassifiedUrl) => Promise<FetchOutcome>> = {
	youtube: fetchYoutube,
	tiktok: fetchTiktok,
};

/**
 * Resolve a URL to a transcript. Returns `unsupported` for links we don't
 * recognize and `unavailable` (with a reason) when a recognized platform yields
 * no transcript. Never throws for the expected failure modes — callers branch on
 * `status`.
 */
export async function fetchTranscript(raw: string): Promise<FetchOutcome> {
	const classified = classifyUrl(raw);
	if (!classified) return { status: 'unsupported' };
	return FETCHERS[classified.platform](classified);
}
