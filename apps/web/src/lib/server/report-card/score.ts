import {
	ALL_CHECK_IDS,
	FORBIDDEN_LABELS,
	LEGACY_LABEL_ALIASES,
	REQUIRED_JUSTFILE_RECIPES,
	REQUIRED_LABELS,
	type CheckResult,
	type CheckStatus,
	type RepoScore,
} from '$lib/report-card.js';
import { GitHubApiError, type GitHubClient } from '../github/client.js';
import { fetchFileContent, fetchRepoTree } from '../github/queries.js';
import type { Repo } from '../github/types.js';

interface RepoSettings {
	allow_merge_commit?: boolean;
	allow_rebase_merge?: boolean;
	squash_merge_commit_title?: string;
	allow_update_branch?: boolean;
	delete_branch_on_merge?: boolean;
	default_branch?: string;
}

interface BranchProtection {
	required_pull_request_reviews?: { required_approving_review_count?: number };
	required_status_checks?: { contexts?: string[]; checks?: { context: string }[] };
}

function result(id: string, status: CheckStatus, note: string | null = null): CheckResult {
	return { id, status, note };
}

function pass(id: string, ok: boolean, failNote: string | null = null): CheckResult {
	return result(id, ok ? 'pass' : 'fail', ok ? null : failNote);
}

export function parseJustfileRecipes(content: string): Set<string> {
	const recipes = new Set<string>();
	for (const match of content.matchAll(/^([a-z][a-z0-9_-]*)(?:\s[^:\n]*)?:/gm)) {
		recipes.add(match[1]);
	}
	return recipes;
}

/**
 * Heuristic workflow-trigger detection — a real YAML parse would need a new
 * dependency, so match the two shapes GitHub docs use: an `on:` inline array
 * (`on: [push, pull_request]`) or an indented trigger key under `on:`.
 */
export function hasTrigger(content: string, trigger: string): boolean {
	const inline = content.match(/^(?:on|"on")\s*:\s*\[([^\]]*)\]/m);
	if (inline && inline[1].split(',').some((t) => t.trim().replace(/["']/g, '') === trigger)) {
		return true;
	}
	return new RegExp(`^\\s{1,6}${trigger}\\s*:`, 'm').test(content);
}

/**
 * True when the workflow runs on pushes to the default branch: a push trigger
 * with no branches filter (runs everywhere), or one whose filter names the
 * default branch.
 */
export function pushesToBranch(content: string, branch: string): boolean {
	if (!hasTrigger(content, 'push')) return false;
	const pushBlock = content.match(/^\s{1,6}push\s*:\s*\n((?:^\s{3,}.*\n?)*)/m);
	if (!pushBlock) return true; // `on: [push]` or bare `push:` — no filter
	const branchesLine = pushBlock[1].match(/branches(?:-ignore)?\s*:\s*(.*(?:\n\s*-\s*.*)*)/);
	if (!branchesLine) return true;
	return branchesLine[0].includes(branch);
}

export function checkCi(tree: Set<string>, content: string | null): CheckResult[] {
	const exists = [...tree].some((p) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p));
	if (!exists || content === null) {
		const note = exists ? 'Could not read workflow file' : null;
		const dependent: CheckStatus = exists ? 'unknown' : 'fail';
		return [
			pass('ci.exists', exists, 'No workflow under .github/workflows/'),
			result('ci.pull-request', dependent, note),
			result('ci.push-main', dependent, note),
		];
	}
	return [
		pass('ci.exists', true),
		pass('ci.pull-request', hasTrigger(content, 'pull_request'), 'No pull_request trigger'),
		pass('ci.push-main', pushesToBranch(content, 'main'), 'No push trigger for main'),
	];
}

export function checkSettings(settings: RepoSettings): CheckResult[] {
	const known = settings.allow_merge_commit !== undefined;
	if (!known) {
		const note = 'Merge settings not visible to this token';
		return [
			result('settings.squash-only', 'unknown', note),
			result('settings.squash-title', 'unknown', note),
			result('settings.update-branch', 'unknown', note),
			result('settings.delete-on-merge', 'unknown', note),
		];
	}
	return [
		pass(
			'settings.squash-only',
			settings.allow_merge_commit === false && settings.allow_rebase_merge === false,
			'Merge commits or rebase merging still enabled'
		),
		pass(
			'settings.squash-title',
			settings.squash_merge_commit_title === 'PR_TITLE',
			`squash_merge_commit_title is ${settings.squash_merge_commit_title ?? 'unset'}`
		),
		pass('settings.update-branch', settings.allow_update_branch === true, 'allow_update_branch disabled'),
		pass(
			'settings.delete-on-merge',
			settings.delete_branch_on_merge === true,
			'delete_branch_on_merge disabled'
		),
	];
}

export function checkLabels(names: string[]): CheckResult[] {
	const present = new Set(names.map((n) => n.toLowerCase()));
	const missing = REQUIRED_LABELS.filter((label) => {
		if (present.has(label.toLowerCase())) return false;
		const legacy = LEGACY_LABEL_ALIASES[label];
		return !(legacy && present.has(legacy));
	});
	const forbidden = FORBIDDEN_LABELS.filter((label) => present.has(label));
	return [
		pass('labels.required', missing.length === 0, missing.length ? `Missing: ${missing.join(', ')}` : null),
		pass('labels.forbidden', forbidden.length === 0, forbidden.length ? `Present: ${forbidden.join(', ')}` : null),
	];
}

export async function checkProtection(
	client: GitHubClient,
	owner: string,
	name: string,
	defaultBranch: string
): Promise<CheckResult[]> {
	let protection: BranchProtection;
	try {
		protection = await client.get<BranchProtection>(
			owner,
			`/repos/${owner}/${name}/branches/${defaultBranch}/protection`
		);
	} catch (err) {
		if (err instanceof GitHubApiError && err.status === 404) {
			const note = `No protection rule on ${defaultBranch}`;
			return [
				result('protection.enabled', 'fail', note),
				result('protection.approvals', 'fail', note),
				result('protection.status-checks', 'fail', note),
			];
		}
		const note =
			err instanceof GitHubApiError && err.status === 403
				? 'Token lacks admin access — cannot read protection'
				: 'Could not read branch protection';
		return [
			result('protection.enabled', 'unknown', note),
			result('protection.approvals', 'unknown', note),
			result('protection.status-checks', 'unknown', note),
		];
	}

	const approvals = protection.required_pull_request_reviews?.required_approving_review_count ?? 0;
	const contexts = [
		...(protection.required_status_checks?.contexts ?? []),
		...(protection.required_status_checks?.checks?.map((c) => c.context) ?? []),
	];
	const hasLint = contexts.some((c) => /lint/i.test(c));
	const hasTest = contexts.some((c) => /test/i.test(c));
	return [
		pass('protection.enabled', true),
		pass('protection.approvals', approvals >= 1, 'No approving review required'),
		pass(
			'protection.status-checks',
			hasLint && hasTest,
			contexts.length ? `Required checks: ${contexts.join(', ')}` : 'No required status checks'
		),
	];
}

function toScore(repo: Repo, results: CheckResult[]): RepoScore {
	const checks = Object.fromEntries(results.map((r) => [r.id, r]));
	return {
		full_name: repo.full_name,
		html_url: repo.html_url,
		checks,
		passed: results.filter((r) => r.status === 'pass').length,
		total: results.length,
	};
}

/** All-unknown score for a repo whose checks could not run at all. */
export function unknownScore(repo: Repo, note: string): RepoScore {
	return toScore(
		repo,
		ALL_CHECK_IDS.map((id) => result(id, 'unknown', note))
	);
}

export async function scoreRepo(client: GitHubClient, repo: Repo): Promise<RepoScore> {
	const [owner, name] = repo.full_name.split('/');
	const tree = await fetchRepoTree(client, owner, name);

	const workflowPaths = [...tree]
		.filter((p) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p))
		.sort((a, b) => (a.endsWith('/ci.yml') ? -1 : b.endsWith('/ci.yml') ? 1 : a.localeCompare(b)));

	const [justfile, workflow, settings, labelNames] = await Promise.all([
		tree.has('Justfile') ? fetchFileContent(client, owner, name, 'Justfile') : Promise.resolve(null),
		workflowPaths.length
			? fetchFileContent(client, owner, name, workflowPaths[0])
			: Promise.resolve(null),
		client.get<RepoSettings>(owner, `/repos/${owner}/${name}`).catch(() => ({}) as RepoSettings),
		client
			.paginate<{ name: string }>(owner, `/repos/${owner}/${name}/labels`)
			.then((labels): string[] | null => labels.map((l) => l.name))
			.catch(() => null),
	]);

	const results: CheckResult[] = [
		pass('readme.exists', tree.has('README.md'), 'No README.md'),
		pass('purpose.exists', tree.has('docs/PURPOSE.md'), 'No docs/PURPOSE.md'),
		pass('gitignore.exists', tree.has('.gitignore'), 'No .gitignore'),
		pass('justfile.exists', tree.has('Justfile'), 'No Justfile'),
	];

	if (justfile) {
		const recipes = parseJustfileRecipes(justfile);
		const missing = REQUIRED_JUSTFILE_RECIPES.filter((r) => !recipes.has(r));
		results.push(
			pass('justfile.recipes', missing.length === 0, missing.length ? `Missing: ${missing.join(', ')}` : null)
		);
	} else {
		results.push(
			result(
				'justfile.recipes',
				tree.has('Justfile') ? 'unknown' : 'fail',
				tree.has('Justfile') ? 'Could not read Justfile' : 'No Justfile'
			)
		);
	}

	results.push(...checkCi(tree, workflow));
	results.push(...checkSettings(settings));
	results.push(
		...(labelNames !== null
			? checkLabels(labelNames)
			: [
					result('labels.required', 'unknown', 'Could not list labels'),
					result('labels.forbidden', 'unknown', 'Could not list labels'),
				])
	);
	results.push(...(await checkProtection(client, owner, name, settings.default_branch ?? 'main')));

	return toScore(repo, results);
}
