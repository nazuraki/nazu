import { extname } from 'node:path';

export type Language = 'typescript' | 'svelte' | 'python' | 'rust' | 'go' | 'unknown';

const EXT_MAP: Record<string, Language> = {
	'.ts': 'typescript',
	'.tsx': 'typescript',
	'.js': 'typescript', // ts-morph handles .js too
	'.svelte': 'svelte',
	'.py': 'python',
	'.rs': 'rust',
	'.go': 'go',
};

export function detectLanguage(filePath: string): Language {
	return EXT_MAP[extname(filePath).toLowerCase()] ?? 'unknown';
}

export const INCLUDE_GLOBS = [
	'**/*.ts',
	'**/*.tsx',
	'**/*.svelte',
	'**/*.py',
	'**/*.rs',
	'**/*.go',
];

export const EXCLUDE_GLOBS = [
	'**/node_modules/**',
	'**/.svelte-kit/**',
	'**/dist/**',
	'**/build/**',
	'**/target/**', // Rust build output
	'**/__pycache__/**',
	'**/.venv/**',
	'**/.git/**',
	'**/coverage/**',
	'**/*.min.js',
	'**/*.d.ts',
];

export function isTestFile(filePath: string): boolean {
	return (
		filePath.includes('.test.') ||
		filePath.includes('.spec.') ||
		filePath.includes('_test.') ||
		filePath.includes('/tests/') ||
		filePath.includes('/test/')
	);
}
