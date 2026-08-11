import { describe, expect, it } from 'vitest';
import { ALL_CHECK_IDS, areaStatus, CHECKLIST } from '$lib/report-card';
import { GitHubApiError, type GitHubClient } from '../github/client';
import type { Repo } from '../github/types';
import {
	checkCi,
	checkLabels,
	checkProtection,
	checkSettings,
	hasTrigger,
	parseJustfileRecipes,
	pushesToBranch,
	scoreRepo,
	unknownScore,
} from './score';

const REPO: Repo = {
	id: 1,
	name: 'proj',
	full_name: 'alice/proj',
	description: null,
	private: false,
	archived: false,
	html_url: 'https://github.com/alice/proj',
	pushed_at: null,
	open_issues_count: 0,
	visibility: 'public',
};

const FULL_JUSTFILE = [
	'# proj — a project',
	'default:',
	'    @just --list',
	'install:',
	'check: lint typecheck test',
	'lint:',
	'fix:',
	'typecheck:',
	'test:',
	'clean:',
	'fresh: clean install',
].join('\n');

const CI_YML = ['on:', '  pull_request:', '  push:', '    branches: [main]', 'jobs: {}'].join('\n');

const GOOD_SETTINGS = {
	allow_merge_commit: false,
	allow_rebase_merge: false,
	squash_merge_commit_title: 'PR_TITLE',
	allow_update_branch: true,
	delete_branch_on_merge: true,
	default_branch: 'main',
};

const GOOD_LABELS = [
	'feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'perf', 'ci', 'build', 'style',
	'revert', 'priority', 'nice to have', 'wontfix', 'question', 'invalid',
	'XS', 'S', 'M', 'L', 'XL',
];

const GOOD_PROTECTION = {
	required_pull_request_reviews: { required_approving_review_count: 1 },
	required_status_checks: { contexts: ['CI / lint', 'CI / test'] },
};

interface FakeRoutes {
	tree?: string[];
	files?: Record<string, string>;
	settings?: Record<string, unknown>;
	labels?: string[] | Error;
	protection?: Record<string, unknown> | Error;
}

function fakeClient(routes: FakeRoutes): GitHubClient {
	const get = async (_owner: string, path: string) => {
		if (path.endsWith('/git/trees/HEAD')) {
			return { tree: (routes.tree ?? []).map((p) => ({ path: p })) };
		}
		const file = path.match(/\/contents\/(.+)$/);
		if (file) {
			const content = routes.files?.[decodeURIComponent(file[1])];
			if (content === undefined) throw new GitHubApiError(404, 'not found');
			return { content: Buffer.from(content).toString('base64'), encoding: 'base64' };
		}
		if (path.includes('/protection')) {
			if (routes.protection instanceof Error) throw routes.protection;
			if (!routes.protection) throw new GitHubApiError(404, 'not protected');
			return routes.protection;
		}
		if (/^\/repos\/[^/]+\/[^/]+$/.test(path)) return routes.settings ?? {};
		throw new Error(`unexpected GET ${path}`);
	};
	const paginate = async (_owner: string, path: string) => {
		if (path.endsWith('/labels')) {
			if (routes.labels instanceof Error) throw routes.labels;
			return (routes.labels ?? []).map((name) => ({ name }));
		}
		throw new Error(`unexpected paginate ${path}`);
	};
	return { get, paginate } as unknown as GitHubClient;
}

describe('parseJustfileRecipes', () => {
	it('finds recipe names, including ones with dependencies and arguments', () => {
		const recipes = parseJustfileRecipes(FULL_JUSTFILE);
		expect(recipes.has('default')).toBe(true);
		expect(recipes.has('check')).toBe(true);
		expect(recipes.has('fresh')).toBe(true);
		expect(recipes.has('@just')).toBe(false);
	});
});

describe('workflow trigger detection', () => {
	it('matches block-form triggers', () => {
		expect(hasTrigger(CI_YML, 'pull_request')).toBe(true);
		expect(hasTrigger(CI_YML, 'push')).toBe(true);
		expect(hasTrigger(CI_YML, 'schedule')).toBe(false);
	});

	it('matches inline-array triggers', () => {
		const yml = 'on: [push, pull_request]\njobs: {}';
		expect(hasTrigger(yml, 'pull_request')).toBe(true);
		expect(pushesToBranch(yml, 'main')).toBe(true);
	});

	it('respects a push branches filter', () => {
		expect(pushesToBranch(CI_YML, 'main')).toBe(true);
		expect(pushesToBranch(CI_YML.replace('[main]', '[release]'), 'main')).toBe(false);
	});

	it('treats an unfiltered push trigger as covering main', () => {
		expect(pushesToBranch('on:\n  push:\njobs: {}', 'main')).toBe(true);
	});
});

describe('checkCi', () => {
	it('fails all checks when no workflow exists', () => {
		const results = checkCi(new Set(['README.md']), null);
		expect(results.map((r) => r.status)).toEqual(['fail', 'fail', 'fail']);
	});

	it('marks trigger checks unknown when the workflow cannot be read', () => {
		const results = checkCi(new Set(['.github/workflows/ci.yml']), null);
		expect(results.map((r) => r.status)).toEqual(['pass', 'unknown', 'unknown']);
	});
});

describe('checkSettings', () => {
	it('passes compliant settings', () => {
		expect(checkSettings(GOOD_SETTINGS).every((r) => r.status === 'pass')).toBe(true);
	});

	it('fails non-compliant fields with notes', () => {
		const results = checkSettings({ ...GOOD_SETTINGS, allow_rebase_merge: true, squash_merge_commit_title: 'COMMIT_OR_PR_TITLE' });
		const byId = Object.fromEntries(results.map((r) => [r.id, r]));
		expect(byId['settings.squash-only'].status).toBe('fail');
		expect(byId['settings.squash-title'].note).toContain('COMMIT_OR_PR_TITLE');
		expect(byId['settings.delete-on-merge'].status).toBe('pass');
	});

	it('returns unknown when merge settings are not visible', () => {
		expect(checkSettings({}).every((r) => r.status === 'unknown')).toBe(true);
	});
});

describe('checkLabels', () => {
	it('passes the full required set with nothing forbidden', () => {
		expect(checkLabels(GOOD_LABELS).every((r) => r.status === 'pass')).toBe(true);
	});

	it('accepts legacy names for feat/fix/docs', () => {
		const legacy = GOOD_LABELS.map((l) =>
			l === 'feat' ? 'feature' : l === 'fix' ? 'bug' : l === 'docs' ? 'documentation' : l
		);
		const byId = Object.fromEntries(checkLabels(legacy).map((r) => [r.id, r]));
		expect(byId['labels.required'].status).toBe('pass');
	});

	it('reports missing and forbidden labels', () => {
		const byId = Object.fromEntries(
			checkLabels(['feat', 'good first issue']).map((r) => [r.id, r])
		);
		expect(byId['labels.required'].status).toBe('fail');
		expect(byId['labels.required'].note).toContain('perf');
		expect(byId['labels.forbidden'].status).toBe('fail');
		expect(byId['labels.forbidden'].note).toContain('good first issue');
	});
});

describe('checkProtection', () => {
	it('passes a compliant protection rule', async () => {
		const client = fakeClient({ protection: GOOD_PROTECTION });
		const results = await checkProtection(client, 'alice', 'proj', 'main');
		expect(results.every((r) => r.status === 'pass')).toBe(true);
	});

	it('reads check names from the newer checks[] shape', async () => {
		const client = fakeClient({
			protection: {
				required_pull_request_reviews: { required_approving_review_count: 1 },
				required_status_checks: { checks: [{ context: 'lint' }, { context: 'test' }] },
			},
		});
		const results = await checkProtection(client, 'alice', 'proj', 'main');
		expect(results.every((r) => r.status === 'pass')).toBe(true);
	});

	it('fails all checks on 404 (protection not enabled)', async () => {
		const client = fakeClient({});
		const results = await checkProtection(client, 'alice', 'proj', 'main');
		expect(results.map((r) => r.status)).toEqual(['fail', 'fail', 'fail']);
	});

	it('returns unknown on 403 (token lacks admin)', async () => {
		const client = fakeClient({ protection: new GitHubApiError(403, 'forbidden') });
		const results = await checkProtection(client, 'alice', 'proj', 'main');
		expect(results.every((r) => r.status === 'unknown')).toBe(true);
		expect(results[0].note).toContain('admin');
	});

	it('fails status-checks when lint or test is not required', async () => {
		const client = fakeClient({
			protection: {
				required_pull_request_reviews: { required_approving_review_count: 2 },
				required_status_checks: { contexts: ['CI / lint'] },
			},
		});
		const byId = Object.fromEntries(
			(await checkProtection(client, 'alice', 'proj', 'main')).map((r) => [r.id, r])
		);
		expect(byId['protection.approvals'].status).toBe('pass');
		expect(byId['protection.status-checks'].status).toBe('fail');
		expect(byId['protection.status-checks'].note).toContain('CI / lint');
	});
});

describe('scoreRepo', () => {
	const fullyCompliant: FakeRoutes = {
		tree: [
			'README.md',
			'docs/PURPOSE.md',
			'.gitignore',
			'Justfile',
			'.github/workflows/ci.yml',
		],
		files: { Justfile: FULL_JUSTFILE, '.github/workflows/ci.yml': CI_YML },
		settings: GOOD_SETTINGS,
		labels: GOOD_LABELS,
		protection: GOOD_PROTECTION,
	};

	it('scores a fully compliant repo as all-pass with one result per checklist check', async () => {
		const score = await scoreRepo(fakeClient(fullyCompliant), REPO);
		expect(Object.keys(score.checks).sort()).toEqual([...ALL_CHECK_IDS].sort());
		expect(score.passed).toBe(score.total);
		expect(CHECKLIST.every((a) => areaStatus(a, score) === 'pass')).toBe(true);
	});

	it('fails file checks for an empty tree without throwing', async () => {
		const score = await scoreRepo(fakeClient({ settings: GOOD_SETTINGS, labels: [] }), REPO);
		expect(score.checks['readme.exists'].status).toBe('fail');
		expect(score.checks['justfile.recipes'].status).toBe('fail');
		expect(score.checks['ci.exists'].status).toBe('fail');
	});

	it('reports missing Justfile recipes by name', async () => {
		const routes = {
			...fullyCompliant,
			files: { ...fullyCompliant.files, Justfile: 'default:\n    @just --list\n' },
		};
		const score = await scoreRepo(fakeClient(routes), REPO);
		expect(score.checks['justfile.recipes'].status).toBe('fail');
		expect(score.checks['justfile.recipes'].note).toContain('typecheck');
	});

	it('marks labels unknown when the listing fails', async () => {
		const score = await scoreRepo(
			fakeClient({ ...fullyCompliant, labels: new GitHubApiError(500, 'boom') }),
			REPO
		);
		expect(score.checks['labels.required'].status).toBe('unknown');
	});

	it('checks protection on the default branch from repo settings', async () => {
		const inner = fakeClient({
			...fullyCompliant,
			settings: { ...GOOD_SETTINGS, default_branch: 'trunk' },
		});
		const protectionPaths: string[] = [];
		const client = {
			get: async (owner: string, path: string) => {
				if (path.includes('/protection')) protectionPaths.push(path);
				return inner.get(owner, path);
			},
			paginate: inner.paginate.bind(inner),
		} as unknown as GitHubClient;

		const score = await scoreRepo(client, REPO);

		expect(protectionPaths).toEqual(['/repos/alice/proj/branches/trunk/protection']);
		expect(score.checks['protection.enabled'].status).toBe('pass');
	});
});

describe('unknownScore', () => {
	it('covers every checklist check with an unknown result', () => {
		const score = unknownScore(REPO, 'GitHub unreachable');
		expect(Object.keys(score.checks).sort()).toEqual([...ALL_CHECK_IDS].sort());
		expect(Object.values(score.checks).every((r) => r.status === 'unknown')).toBe(true);
		expect(score.passed).toBe(0);
	});
});
