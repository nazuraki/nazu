import { NAZU_URL, authHeaders } from './env.js';

export type IngestStatus = 'ingested' | 'duplicate' | 'unsupported' | 'unavailable' | 'error';

export interface IngestResult {
	status: IngestStatus;
	id?: string;
	title?: string;
	reason?: string;
}

/**
 * POST a URL to the web app for transcript fetch + ingest. Never throws: a
 * transport failure or unexpected status maps to an `error` result so a single
 * bad link can't take the message handler down. `fetchImpl` is injectable for
 * tests.
 */
export async function ingestUrl(
	url: string,
	opts: { postedBy?: string } = {},
	fetchImpl: typeof fetch = fetch,
): Promise<IngestResult> {
	let res: Response;
	try {
		res = await fetchImpl(`${NAZU_URL}/api/ingest/url`, {
			method: 'POST',
			headers: authHeaders({ 'content-type': 'application/json' }),
			body: JSON.stringify({ url, postedBy: opts.postedBy }),
		});
	} catch (err) {
		return { status: 'error', reason: (err as Error).message };
	}

	if (res.status === 201 || res.status === 200) {
		const data = (await res.json()) as { status?: string; id?: string; title?: string };
		return {
			status: data.status === 'duplicate' ? 'duplicate' : 'ingested',
			id: data.id,
			title: data.title,
		};
	}
	if (res.status === 422) {
		const data = (await res.json()) as { status?: string; reason?: string };
		return {
			status: data.status === 'unsupported' ? 'unsupported' : 'unavailable',
			reason: data.reason,
		};
	}
	return { status: 'error', reason: `HTTP ${res.status}` };
}
