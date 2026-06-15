import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts"],
		globalSetup: ["./global-setup.ts"],
		// Functional tests share one DB/stack; several files truncate overlapping
		// tables in beforeEach, so they must not run concurrently. (Was a no-op
		// typo `fileParallel` — the correct Vitest option is `fileParallelism`.)
		fileParallelism: false,
		testTimeout: 30_000,
		hookTimeout: 180_000,
		globals: true,
	},
});
