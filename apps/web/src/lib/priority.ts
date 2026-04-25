import type { Issue, PullRequest } from './dashboard/api.js';

const LABEL_WEIGHTS: { pattern: RegExp; score: number }[] = [
	{ pattern: /^priority$/i, score: 8 },
	{ pattern: /^nice to have$/i, score: 1 },
];

function labelScore(labels: Issue["labels"]): number {
	return labels.reduce((acc, label) => {
		const match = LABEL_WEIGHTS.find((w) => w.pattern.test(label.name));
		return acc + (match?.score ?? 0);
	}, 0);
}

function linkedPRNumbers(prs: PullRequest[]): Set<number> {
	const refs = new Set<number>();
	const pattern = /(?:closes?|fixes?|resolves?)\s+#(\d+)/gi;
	for (const pr of prs) {
		if (!pr.body) continue;
		for (const match of pr.body.matchAll(pattern)) {
			refs.add(Number(match[1]));
		}
	}
	return refs;
}

function priorityScore(issue: Issue, linked: Set<number>): number {
	let score = 0;
	score += linked.has(issue.number) ? 3 : 0;
	score += labelScore(issue.labels);
	score += Math.min(issue.comments, 20) * 0.3;
	const ageDays = (Date.now() - Date.parse(issue.created_at)) / 86_400_000;
	score += Math.min(ageDays, 90) * 0.05;
	return score;
}

export function sortIssues(issues: Issue[], prs: PullRequest[]): Issue[] {
	const linked = linkedPRNumbers(prs);
	return [...issues].sort((a, b) => priorityScore(b, linked) - priorityScore(a, linked));
}

export function isLinked(issue: Issue, prs: PullRequest[]): boolean {
	return linkedPRNumbers(prs).has(issue.number);
}
