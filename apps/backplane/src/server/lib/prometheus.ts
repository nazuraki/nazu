export interface PromResponse {
	status: number;
	body: unknown;
}

export interface PromClient {
	queryRange(params: { query: string; start: string; end: string; step: string }): Promise<PromResponse>;
	query(params: { query: string; time?: string }): Promise<PromResponse>;
}

/**
 * Thin proxy to Prometheus's HTTP API. The backplane exposes `query_range` so
 * the UI/MCP get inline metrics without talking to Prometheus directly.
 */
export function createPromClient(baseUrl: string, fetchFn: typeof fetch = fetch): PromClient {
	const base = baseUrl.replace(/\/+$/, '');

	async function call(path: string, params: Record<string, string | undefined>): Promise<PromResponse> {
		const url = new URL(`${base}${path}`);
		for (const [k, v] of Object.entries(params)) {
			if (v !== undefined) url.searchParams.set(k, v);
		}
		const res = await fetchFn(url.toString());
		return { status: res.status, body: await res.json() };
	}

	return {
		queryRange: (params) => call('/api/v1/query_range', params),
		query: (params) => call('/api/v1/query', params),
	};
}
