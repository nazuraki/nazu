export interface Repo {
	id: number;
	name: string;
	full_name: string;
	description: string | null;
	private: boolean;
	archived: boolean;
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
	pull_request?: unknown;
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
