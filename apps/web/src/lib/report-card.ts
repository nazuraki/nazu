/**
 * Report Card checklist — the machine-checkable subset of the project-standards
 * audit (canonical source: nazuraki/claude audit-skill/SKILL.md, plus the
 * branch-protection checks from nazuraki/claude#12).
 *
 * Shared between the server scorer ($lib/server/report-card/) and the
 * /report-card page, so keep this module free of server-only imports.
 */

export type CheckStatus = 'pass' | 'fail' | 'unknown';

export interface CheckDef {
	/** Machine-friendly id, namespaced by area: `<area>.<check>`. */
	id: string;
	label: string;
	description: string;
}

export interface AreaDef {
	id: string;
	title: string;
	description: string;
	checks: CheckDef[];
}

export interface CheckResult {
	id: string;
	status: CheckStatus;
	/** Short human-readable detail (e.g. which recipes are missing), else null. */
	note: string | null;
}

export interface RepoScore {
	full_name: string;
	html_url: string;
	/** One result per checklist check, keyed by check id. */
	checks: Record<string, CheckResult>;
	passed: number;
	total: number;
}

export interface ReportCardResponse {
	repos: RepoScore[];
	/** True when GitHub was unreachable and the list is cached/empty. */
	stale: boolean;
	error: string | null;
}

export const REQUIRED_JUSTFILE_RECIPES = [
	'default',
	'install',
	'check',
	'lint',
	'fix',
	'typecheck',
	'test',
	'clean',
	'fresh',
] as const;

export const REQUIRED_LABELS = [
	'feat',
	'fix',
	'chore',
	'docs',
	'refactor',
	'test',
	'perf',
	'ci',
	'build',
	'style',
	'revert',
	'priority',
	'nice to have',
	'wontfix',
	'question',
	'invalid',
	'XS',
	'S',
	'M',
	'L',
	'XL',
] as const;

/** Legacy label names that satisfy a required label (flagged for rename by /audit). */
export const LEGACY_LABEL_ALIASES: Record<string, string> = {
	feat: 'feature',
	fix: 'bug',
	docs: 'documentation',
};

export const FORBIDDEN_LABELS = ['good first issue', 'help wanted'] as const;

export const CHECKLIST: AreaDef[] = [
	{
		id: 'readme',
		title: 'README.md',
		description:
			'Front door of the repo: name, one-sentence description, prerequisites, quickstart, link to docs/PURPOSE.md, license. The card automates existence; content quality is checked by /audit.',
		checks: [{ id: 'readme.exists', label: 'File exists', description: 'README.md at the repo root.' }],
	},
	{
		id: 'purpose',
		title: 'docs/PURPOSE.md',
		description:
			'States the problem being solved, explicit non-goals, and the intended audience.',
		checks: [{ id: 'purpose.exists', label: 'File exists', description: 'docs/PURPOSE.md present.' }],
	},
	{
		id: 'gitignore',
		title: '.gitignore',
		description:
			'Covers the stack’s build artifacts, .env variants, IDE directories, OS files, and local-only config.',
		checks: [{ id: 'gitignore.exists', label: 'File exists', description: '.gitignore at the repo root.' }],
	},
	{
		id: 'justfile',
		title: 'Justfile',
		description:
			'Standard task runner: default recipe lists tasks; check depends on lint/typecheck/test; lint is read-only and fix is write-mode.',
		checks: [
			{ id: 'justfile.exists', label: 'File exists', description: 'Justfile at the repo root.' },
			{
				id: 'justfile.recipes',
				label: 'Required recipes',
				description: `Has ${REQUIRED_JUSTFILE_RECIPES.join(', ')}.`,
			},
		],
	},
	{
		id: 'ci',
		title: 'CI workflow',
		description:
			'GitHub Actions workflow gating pull requests with lint/typecheck and test jobs, pinned action versions.',
		checks: [
			{
				id: 'ci.exists',
				label: 'Workflow exists',
				description: 'A workflow file under .github/workflows/.',
			},
			{
				id: 'ci.pull-request',
				label: 'Runs on pull_request',
				description: 'Triggers on PR open and update — the critical gate.',
			},
			{
				id: 'ci.push-main',
				label: 'Runs on push to main',
				description: 'Also triggers on pushes to the default branch.',
			},
		],
	},
	{
		id: 'settings',
		title: 'GitHub settings',
		description:
			'Squash-only merges titled from the PR, branch-update suggestions on, auto-delete merged branches. (Social preview image is a manual check — see /audit.)',
		checks: [
			{
				id: 'settings.squash-only',
				label: 'Squash merges only',
				description: 'Merge commits and rebase merging disabled.',
			},
			{
				id: 'settings.squash-title',
				label: 'Commit title = PR title',
				description: 'squash_merge_commit_title is PR_TITLE.',
			},
			{
				id: 'settings.update-branch',
				label: 'Suggest branch updates',
				description: 'allow_update_branch enabled.',
			},
			{
				id: 'settings.delete-on-merge',
				label: 'Auto-delete head branches',
				description: 'delete_branch_on_merge enabled.',
			},
		],
	},
	{
		id: 'labels',
		title: 'Labels',
		description:
			'Conventional Commits type labels, priority labels, and t-shirt effort sizes; no “good first issue” / “help wanted”.',
		checks: [
			{
				id: 'labels.required',
				label: 'Required labels present',
				description: 'All type, priority, and effort labels exist (legacy names count).',
			},
			{
				id: 'labels.forbidden',
				label: 'No forbidden labels',
				description: `Neither ${FORBIDDEN_LABELS.join(' nor ')} present.`,
			},
		],
	},
	{
		id: 'protection',
		title: 'Branch protection',
		description:
			'Default branch is protected: PRs need an approval and passing CI before merge (nazuraki/claude#12).',
		checks: [
			{
				id: 'protection.enabled',
				label: 'Protection enabled',
				description: 'The default branch has a protection rule.',
			},
			{
				id: 'protection.approvals',
				label: 'Requires PR approval',
				description: 'At least one approving review required before merge.',
			},
			{
				id: 'protection.status-checks',
				label: 'Requires CI lint + test',
				description: 'Required status checks include the CI lint and test jobs.',
			},
		],
	},
];

export const ALL_CHECK_IDS: string[] = CHECKLIST.flatMap((a) => a.checks.map((c) => c.id));

/** Roll a repo's per-check results up to an area verdict for the score table. */
export function areaStatus(area: AreaDef, score: RepoScore): CheckStatus {
	const statuses = area.checks.map((c) => score.checks[c.id]?.status ?? 'unknown');
	if (statuses.includes('fail')) return 'fail';
	if (statuses.includes('unknown')) return 'unknown';
	return 'pass';
}
