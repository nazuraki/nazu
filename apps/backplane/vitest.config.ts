import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/server/**/*.test.ts', 'src/mcp/**/*.test.ts'],
		environment: 'node',
	},
});
