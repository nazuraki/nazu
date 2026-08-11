import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Builds the React SPA only; the server/MCP are compiled by tsc (tsconfig.build.json).
export default defineConfig({
	root: 'src/ui',
	plugins: [react()],
	build: {
		outDir: '../../dist/ui',
		emptyOutDir: true,
	},
	server: {
		// Dev-only: the SPA proxies API calls to a locally running server.
		proxy: { '/api': 'http://localhost:8430' },
	},
});
