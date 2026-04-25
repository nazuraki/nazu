import { writable } from 'svelte/store';
import type { EntryDetail, SearchResponse } from './types';

export interface SearchCache {
	query: string;
	page: number;
	results: SearchResponse;
}

export const searchCache = writable<SearchCache | null>(null);
export const entryCache = writable<Map<string, EntryDetail>>(new Map());
