import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
	api,
	type ComposeServiceStatus,
	type DeployRecord,
	type DeploySummary,
	type ImageUpdate,
	type Project,
} from '../api';

function stateBadge(state: string): string {
	if (state === 'running') return 'badge ok';
	if (state === 'exited' || state === 'dead') return 'badge err';
	return 'badge warn';
}

function DeployLog({ project, id }: { project: string; id: number }): React.JSX.Element {
	const { data } = useQuery({
		queryKey: ['deploy', project, id],
		queryFn: () => api<{ deploy: DeployRecord }>(`/api/projects/${project}/deploys/${id}`),
		refetchInterval: (q) => (q.state.data?.deploy.status === 'running' ? 2000 : false),
	});
	if (!data) return <p className="muted">Loading…</p>;
	return <pre className="log">{data.deploy.log || '(no output yet)'}</pre>;
}

export function ProjectPage({ name }: { name: string }): React.JSX.Element {
	const qc = useQueryClient();
	const [openLog, setOpenLog] = useState<number | null>(null);

	const project = useQuery({
		queryKey: ['project', name],
		queryFn: () => api<{ project: Project }>(`/api/projects/${name}`),
	});
	const status = useQuery({
		queryKey: ['status', name],
		queryFn: () => api<{ services: ComposeServiceStatus[] }>(`/api/projects/${name}/status`),
		refetchInterval: 10_000,
	});
	const updates = useQuery({
		queryKey: ['updates', name],
		queryFn: () => api<{ updates: ImageUpdate[] }>(`/api/projects/${name}/updates`),
		refetchInterval: 60_000,
	});
	const deploys = useQuery({
		queryKey: ['deploys', name],
		queryFn: () => api<{ deploys: DeploySummary[] }>(`/api/projects/${name}/deploys`),
		refetchInterval: 5_000,
	});

	const run = useMutation({
		mutationFn: (action: 'deploy' | 'restart') =>
			api<{ deploy: DeploySummary }>(`/api/projects/${name}/${action}`, { method: 'POST' }),
		onSuccess: (res) => {
			setOpenLog(res.deploy.id);
			void qc.invalidateQueries({ queryKey: ['deploys', name] });
		},
	});

	const remove = useMutation({
		mutationFn: () => api(`/api/projects/${name}`, { method: 'DELETE' }),
		onSuccess: () => {
			window.location.hash = '#/projects';
		},
	});

	if (project.isLoading) return <p className="muted">Loading…</p>;
	if (project.error) return <p className="error">{(project.error as Error).message}</p>;
	const p = project.data!.project;

	return (
		<>
			<div className="row">
				<h1 style={{ flex: 1 }}>{p.name}</h1>
				<button onClick={() => run.mutate('deploy')} disabled={run.isPending}>
					Deploy
				</button>
				<button onClick={() => run.mutate('restart')} disabled={run.isPending}>
					Restart
				</button>
				<button
					className="danger"
					onClick={() => {
						if (window.confirm(`Remove project "${p.name}" from the registry?`)) remove.mutate();
					}}
				>
					Remove
				</button>
			</div>
			<p className="muted">
				{p.gitUrl} ({p.branch}) — target: {p.target.type}
				{p.target.profiles?.length ? ` [${p.target.profiles.join(', ')}]` : ''} — auto-deploy:{' '}
				{p.autoDeploy ? 'on' : 'off'}
			</p>
			{run.isError && <p className="error">{(run.error as Error).message}</p>}

			<h2>Services</h2>
			<div className="panel">
				{status.error && <p className="error">{(status.error as Error).message}</p>}
				{status.data?.services.length === 0 && <p className="muted">No services — never deployed?</p>}
				{!!status.data?.services.length && (
					<table>
						<thead>
							<tr>
								<th>Service</th>
								<th>State</th>
								<th>Status</th>
								<th>Image</th>
							</tr>
						</thead>
						<tbody>
							{status.data.services.map((s) => (
								<tr key={s.service}>
									<td>{s.service}</td>
									<td>
										<span className={stateBadge(s.state)}>{s.state}</span>
									</td>
									<td className="muted">{s.status}</td>
									<td className="muted">{s.image}</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>

			{p.images.length > 0 && (
				<>
					<h2>Images</h2>
					<div className="panel">
						<table>
							<tbody>
								{(updates.data?.updates ?? []).map((u) => (
									<tr key={u.image}>
										<td>{u.image}</td>
										<td>
											{u.error ? (
												<span className="badge warn" title={u.error}>
													check failed
												</span>
											) : u.updateAvailable ? (
												<span className="badge warn">update available</span>
											) : (
												<span className="badge ok">up to date</span>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</>
			)}

			<h2>Deploy history</h2>
			<div className="panel">
				{deploys.data?.deploys.length === 0 && <p className="muted">No deploys yet.</p>}
				{!!deploys.data?.deploys.length && (
					<table>
						<thead>
							<tr>
								<th>#</th>
								<th>Action</th>
								<th>Trigger</th>
								<th>Status</th>
								<th>Started</th>
							</tr>
						</thead>
						<tbody>
							{deploys.data.deploys.map((d) => (
								<tr
									key={d.id}
									className="clickable"
									onClick={() => setOpenLog(openLog === d.id ? null : d.id)}
								>
									<td>{d.id}</td>
									<td>{d.action}</td>
									<td className="muted">{d.trigger}</td>
									<td>
										<span
											className={
												d.status === 'succeeded'
													? 'badge ok'
													: d.status === 'failed'
														? 'badge err'
														: 'badge warn'
											}
										>
											{d.status}
										</span>
									</td>
									<td className="muted">{new Date(d.startedAt).toLocaleString()}</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
				{openLog !== null && <DeployLog project={name} id={openLog} />}
			</div>
		</>
	);
}
