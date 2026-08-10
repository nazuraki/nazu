import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { api, queryRange, type ContainerSummary } from '../api';
import { Chart, formatBytes, formatCpu, type ChartSeries } from '../components/Chart';
import { LogStream } from '../components/LogStream';

function toSeries(
	result: { metric: Record<string, string>; values: [number, string][] }[] | undefined,
	label: (metric: Record<string, string>) => string,
): ChartSeries[] {
	return (result ?? []).map((r) => ({
		label: label(r.metric),
		points: r.values.map(([t, v]) => [t, Number.isFinite(Number(v)) ? Number(v) : null]),
	}));
}

function ContainerCharts({ name }: { name: string }): React.JSX.Element {
	const cpu = useQuery({
		queryKey: ['metrics', 'cpu', name],
		queryFn: () =>
			queryRange(`rate(container_cpu_usage_seconds_total{name="${name}"}[2m])`, 30, 30),
		refetchInterval: 30_000,
	});
	const mem = useQuery({
		queryKey: ['metrics', 'mem', name],
		queryFn: () => queryRange(`container_memory_working_set_bytes{name="${name}"}`, 30, 30),
		refetchInterval: 30_000,
	});

	const cpuSeries = useMemo(() => toSeries(cpu.data?.data?.result, () => 'cpu'), [cpu.data]);
	const memSeries = useMemo(() => toSeries(mem.data?.data?.result, () => 'memory'), [mem.data]);

	if (cpu.error || mem.error) {
		return (
			<p className="error">
				Metrics unavailable: {((cpu.error ?? mem.error) as Error).message} (is the Prometheus/cAdvisor
				stack up?)
			</p>
		);
	}
	if (!cpuSeries.length && !memSeries.length) {
		return <p className="muted">No metrics for this container yet.</p>;
	}
	return (
		<div className="charts">
			<div>{cpuSeries.length > 0 && <Chart title="CPU (cores)" series={cpuSeries} formatY={formatCpu} />}</div>
			<div>{memSeries.length > 0 && <Chart title="Memory" series={memSeries} formatY={formatBytes} />}</div>
		</div>
	);
}

export function ContainersPage(): React.JSX.Element {
	const [selected, setSelected] = useState<ContainerSummary | null>(null);
	const { data, error, isLoading } = useQuery({
		queryKey: ['containers'],
		queryFn: () => api<{ containers: ContainerSummary[] }>('/api/containers'),
		refetchInterval: 10_000,
	});

	return (
		<>
			<h1>Containers</h1>
			{isLoading && <p className="muted">Loading…</p>}
			{error && <p className="error">{(error as Error).message}</p>}
			{data && (
				<div className="panel">
					<table>
						<thead>
							<tr>
								<th>Name</th>
								<th>State</th>
								<th>Status</th>
								<th>Image</th>
								<th>Compose project</th>
							</tr>
						</thead>
						<tbody>
							{data.containers.map((c) => (
								<tr
									key={c.fullId}
									className="clickable"
									onClick={() => setSelected(selected?.fullId === c.fullId ? null : c)}
								>
									<td>{c.name}</td>
									<td>
										<span
											className={
												c.state === 'running'
													? 'badge ok'
													: c.state === 'exited'
														? 'badge err'
														: 'badge warn'
											}
										>
											{c.state}
										</span>
									</td>
									<td className="muted">{c.status}</td>
									<td className="muted">{c.image}</td>
									<td className="muted">{c.composeProject ?? '—'}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{selected && (
				<>
					<h2>{selected.name}</h2>
					<ContainerCharts name={selected.name} />
					<h2>Logs</h2>
					<LogStream containerId={selected.fullId} />
				</>
			)}
		</>
	);
}
