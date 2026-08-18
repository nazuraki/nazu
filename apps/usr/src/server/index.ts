import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';

import { createApp } from './app.js';
import { runMigrations } from './lib/migrate.js';

const PORT = Number(process.env.PORT ?? 8432);

await runMigrations();

const app = createApp();

// Static SPA (built by vite into dist/ui), with an index.html fallback for
// client-side routes. API routes are matched first.
app.use('*', serveStatic({ root: './dist/ui' }));
app.get('*', serveStatic({ path: './dist/ui/index.html' }));

serve({ fetch: app.fetch, port: PORT }, (info) => {
	console.log(`usr listening on :${info.port}`);
});
