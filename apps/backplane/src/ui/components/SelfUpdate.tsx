import { Badge, Button } from '@nazuraki/ui-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type ImageUpdate } from '../api';

interface SelfResponse {
	self: (ImageUpdate & { composeProject: string }) | null;
	helper: { state: string; exitCode: number | null; logs: string[] } | null;
	error?: string;
}

/**
 * Nav chip for the backplane's own image: silent when up to date, a button
 * when a newer image is published, a spinner-ish badge while the detached
 * helper recreates us, and a red badge (logs in the tooltip) on failure.
 */
export function SelfUpdate(): React.JSX.Element | null {
	const qc = useQueryClient();
	const { data } = useQuery({
		queryKey: ['self'],
		queryFn: () => api<SelfResponse>('/api/self'),
		refetchInterval: (q) => (q.state.data?.helper?.state === 'running' ? 5_000 : 60_000),
	});

	const update = useMutation({
		mutationFn: () => api('/api/self/update', { method: 'POST' }),
		onSettled: () => void qc.invalidateQueries({ queryKey: ['self'] }),
	});

	if (!data?.self) return null;

	if (data.helper?.state === 'running' || update.isPending) {
		return <Badge variant="warning">backplane updating…</Badge>;
	}

	const failed =
		data.helper?.state === 'exited' && data.helper.exitCode !== 0 ? data.helper : null;

	return (
		<>
			{failed && (
				<Badge variant="danger" title={failed.logs.join('\n')}>
					self-update failed
				</Badge>
			)}
			{update.isError && <span className="error">{(update.error as Error).message}</span>}
			{data.self.updateAvailable && (
				<Button
					variant="accent"
					onClick={() => update.mutate()}
					title={`running ${data.self.runningDigest ?? '?'} → ${data.self.remoteDigest ?? '?'}`}
				>
					Update backplane
				</Button>
			)}
		</>
	);
}
