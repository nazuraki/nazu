export interface Entry {
	id: string;
	title: string;
	content?: string;
	excerpt: string;
	type: string;
	tags: string[];
	author: string;
	created_at: string;
	updated_at: string;
	ref_count: number;
	word_count: number;
	read_time: number;
	vector_score?: number;
	image_url?: string;
}

export interface EntryDetail extends Entry {
	access_level: string;
	related: Entry[];
}

export interface Tag {
	name: string;
	count: number;
}

export interface SearchResponse {
	query: string;
	total: number;
	duration: string;
	page: number;
	page_size: number;
	entries: Entry[];
}
