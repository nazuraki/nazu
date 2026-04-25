import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
	js.configs.recommended,
	...tseslint.configs.recommended,
	...svelte.configs['flat/recommended'],
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
		},
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: { parser: tseslint.parser },
		},
		rules: {
			// Plain <a href> links don't need $app/paths base-path wiring for a
			// self-hosted app with no base path configured.
			'svelte/no-navigation-without-resolve': 'off',
		},
	},
	{
		rules: {
			// Allow underscore-prefixed parameters as intentionally unused.
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
		},
	},
	{
		ignores: ['build/', '.svelte-kit/'],
	},
);
