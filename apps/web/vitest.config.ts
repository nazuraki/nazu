import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Standalone config for fast unit tests (no SvelteKit/PWA plugins). The $lib
// alias mirrors SvelteKit's so modules under test resolve as they do in the app.
export default defineConfig({
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
		},
	},
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
	},
});
