import { streamLogs } from '$lib/server/docker';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const enc = new TextEncoder();
	let cancel = false;

	const stream = new ReadableStream({
		start(controller) {
			streamLogs(params.id, {
				tail: 300,
				onLine(line) {
					if (cancel) return;
					controller.enqueue(enc.encode(`data: ${JSON.stringify(line)}\n\n`));
				},
				onEnd() {
					if (!cancel) controller.close();
				},
				onError() {
					if (!cancel) controller.close();
				},
			});
		},
		cancel() {
			cancel = true;
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		},
	});
};
