import { json } from '@sveltejs/kit';
import { getGitHub } from '$lib/server/github/index.js';
import { fetchFileContent, fetchOrgRepos, fetchRepoTree, fetchUserRepos } from '$lib/server/github/queries.js';

const STANDARD_FILES = [
	{ key: "readme", path: "README.md" },
	{ key: "purpose", path: "docs/PURPOSE.md" },
	{ key: "gitignore", path: ".gitignore" },
	{ key: "justfile", path: "Justfile" },
	{ key: "ci", path: ".github/workflows/ci.yml" },
] as const;

const REQUIRED_JUSTFILE_RECIPES = [
	"default", "install", "build", "check", "lint", "test", "clean", "fresh",
] as const;

function parseJustfileRecipes(content: string): Set<string> {
	const recipes = new Set<string>();
	for (const match of content.matchAll(/^([a-z][a-z0-9_-]*)(?:\s[^:\n]*)?:/gm)) {
		recipes.add(match[1]);
	}
	return recipes;
}

export async function GET() {
	const { github, owners } = await getGitHub();
	const [personal, org] = await Promise.all([
		fetchUserRepos(github, owners.user),
		fetchOrgRepos(github, owners.org),
	]);
	const all = [...personal, ...org];

	const results = await Promise.all(
		all.map(async (repo) => {
			const [owner, name] = repo.full_name.split("/");
			const tree = await fetchRepoTree(github, owner, name);
			const missing = STANDARD_FILES.filter(({ path }) => !tree.has(path)).map(({ key }) => key);

			let justfile_missing_recipes: string[] = [];
			if (tree.has("Justfile")) {
				const content = await fetchFileContent(github, owner, name, "Justfile");
				if (content) {
					const present = parseJustfileRecipes(content);
					justfile_missing_recipes = REQUIRED_JUSTFILE_RECIPES.filter((r) => !present.has(r));
				}
			}

			return { full_name: repo.full_name, missing, justfile_missing_recipes };
		})
	);

	return json(results);
}
