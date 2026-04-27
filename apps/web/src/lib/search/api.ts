import type { Entry, EntryDetail, SearchResponse, Tag } from './types';

const BASE = '/api';

async function get<T>(path: string): Promise<T> {
	const res = await fetch(BASE + path);
	if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
	return res.json();
}

export const api = {
	search(q: string, page = 1, pageSize = 20): Promise<SearchResponse> {
		const params = new URLSearchParams({ q, page: String(page), page_size: String(pageSize) });
		return get<SearchResponse>(`/search?${params}`);
	},
	getEntry(id: string): Promise<EntryDetail> {
		return get<EntryDetail>(`/entries/${encodeURIComponent(id)}`);
	},
	getRecent(limit = 10): Promise<Entry[]> {
		return get<Entry[]>(`/recent?limit=${limit}`);
	},
	getTags(): Promise<Tag[]> {
		return get<Tag[]>('/tags');
	}
};
