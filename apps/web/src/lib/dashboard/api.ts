const BASE = "/dashboard/api";

async function get<T>(path: string): Promise<T> {
	const res = await fetch(`${BASE}${path}`);
	if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
	return res.json() as Promise<T>;
}

export interface Repo {
	id: number;
	name: string;
	full_name: string;
	description: string | null;
	private: boolean;
	html_url: string;
	pushed_at: string | null;
	open_issues_count: number;
	visibility: string;
}

export interface Issue {
	id: number;
	number: number;
	title: string;
	html_url: string;
	labels: { name: string; color: string }[];
	created_at: string;
	comments: number;
}

export interface PullRequest {
	id: number;
	number: number;
	title: string;
	html_url: string;
	body: string | null;
	draft: boolean;
	created_at: string;
}

export interface RepoActivity {
	full_name: string;
	issues: Issue[];
	prs: PullRequest[];
	latestRun: {
		name: string | null;
		conclusion: string | null;
		status: string | null;
		html_url: string;
	} | null;
	pagesRun: { conclusion: string | null; status: string | null; html_url: string } | null;
}

export interface WorkflowRun {
	id: number;
	name: string | null;
	head_branch: string | null;
	event: string;
	status: string | null;
	conclusion: string | null;
	created_at: string;
	run_started_at: string | null;
	html_url: string;
}

export interface StewardRun {
	id: string;
	workflow: string;
	status: "success" | "failure";
	created_at: string;
	duration_ms: number;
	tokens_input: number;
	tokens_output: number;
	cost_usd: number;
	model: string;
}

export interface StewardStats {
	budget: number;
	totalCost: number;
	totalTokens: number;
	successRate: number;
	runs: StewardRun[];
	dailyTokens: { date: string; tokens_input: number; tokens_output: number }[];
}

export type ComplianceKey = "readme" | "purpose" | "gitignore" | "justfile" | "ci";

export interface RepoCompliance {
	full_name: string;
	missing: ComplianceKey[];
	justfile_missing_recipes: string[];
}

export interface NazuTask {
	id: string;
	title: string;
	priority: "high" | "medium" | null;
}

export interface NazuTopic {
	topic: string;
	tasks: NazuTask[];
}

export interface DockerContainer {
	id: string;
	name: string;
	state: string;
	status: string;
}

export const api = {
	repos: () => get<Repo[]>("/repos"),
	activity: () => get<RepoActivity[]>("/repos/activity"),
	compliance: () => get<RepoCompliance[]>("/repos/compliance"),
	stewardStats: () => get<StewardStats>("/steward/stats"),
	nazuProjects: () => get<NazuTopic[]>("/nazu/projects"),
	docker: () => get<DockerContainer[]>("/docker"),
};
