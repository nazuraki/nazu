const GITHUB_API = process.env.GITHUB_API_BASE_URL ?? "https://api.github.com";
const GITHUB_HEADERS = {
	Accept: "application/vnd.github+json",
	"X-GitHub-Api-Version": "2022-11-28",
};

export class GitHubClient {
	private tokens: Map<string, string>;

	constructor(tokens: Record<string, string>) {
		this.tokens = new Map(Object.entries(tokens));
	}

	private tokenFor(owner: string): string {
		const token = this.tokens.get(owner);
		if (!token) throw new Error(`No GitHub token configured for owner: ${owner}`);
		return token;
	}

	private headers(owner: string): Record<string, string> {
		return { ...GITHUB_HEADERS, Authorization: `Bearer ${this.tokenFor(owner)}` };
	}

	async get<T>(owner: string, path: string, params?: Record<string, string>): Promise<T> {
		const url = new URL(`${GITHUB_API}${path}`);
		if (params) {
			for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
		}

		const res = await fetch(url, { headers: this.headers(owner) });
		if (!res.ok) {
			throw new Error(`GitHub API ${res.status} on ${path}: ${await res.text()}`);
		}
		return res.json() as Promise<T>;
	}

	async paginate<T>(owner: string, path: string, params?: Record<string, string>): Promise<T[]> {
		const results: T[] = [];
		let page = 1;

		while (true) {
			const data = await this.get<T[]>(owner, path, {
				...params,
				per_page: "100",
				page: String(page),
			});
			results.push(...data);
			if (data.length < 100) break;
			page++;
		}

		return results;
	}
}
