import { useEffect, useRef, useState } from 'react';

import { authHeaders } from '../api';

/**
 * Live container log tail via a chunked fetch stream (not EventSource, which
 * cannot send the Authorization header).
 */
export function LogStream({ containerId }: { containerId: string }): React.JSX.Element {
	const [lines, setLines] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);
	const pre = useRef<HTMLPreElement>(null);

	useEffect(() => {
		setLines([]);
		setError(null);
		const abort = new AbortController();

		void (async () => {
			try {
				const res = await fetch(`/api/containers/${containerId}/logs?tail=200&follow=1`, {
					headers: authHeaders(),
					signal: abort.signal,
				});
				if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				let buf = '';
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					buf += decoder.decode(value, { stream: true });
					const parts = buf.split('\n');
					buf = parts.pop() ?? '';
					const complete = parts.filter(Boolean);
					if (complete.length) {
						setLines((prev) => [...prev, ...complete].slice(-2000));
					}
				}
			} catch (err) {
				if (!abort.signal.aborted) {
					setError(err instanceof Error ? err.message : String(err));
				}
			}
		})();

		return () => abort.abort();
	}, [containerId]);

	useEffect(() => {
		if (pre.current) pre.current.scrollTop = pre.current.scrollHeight;
	}, [lines]);

	return (
		<>
			{error && <p className="error">{error}</p>}
			<pre className="log" ref={pre}>
				{lines.length ? lines.join('\n') : '(waiting for logs…)'}
			</pre>
		</>
	);
}
