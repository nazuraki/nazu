import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, Spinner, type BadgeProps } from '@nazuraki/ui-react';
import { useState } from 'react';

import {
	api,
	type ComposeServiceStatus,
	type DeployRecord,
	type DeploySummary,
	type ImageUpdate,
	type Project,
} from '../api';

function stateVariant(state: string): BadgeProps['variant'] {
	if (state === 'running') return 'success';
	if (state === 'exited' || state === 'dead') return 'danger';
	return 'warning';
}

function DeployLog({ project, id }: { project: string; id: number }): React.JSX.Element {
	const { data } = useQuery({
		queryKey: ['deploy', project, id],
		queryFn: () => api<{ deploy: DeployRecord }>(`/api/projects/${project}/deploys/${id}`),
		refetchInterval: (q) => (q.state.data?.deploy.status === 'running' ? 2000 : false),
	});
	if (!data) return <Spinner />;
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
		mutationFn: (action: 'deploy' | 'update' | 'restart') =>
			api<{ deploy: DeploySummary }>(`/api/projects/${name}/${action}`, { method: 'POST' }),
		onSuccess: (res) => {
			setOpenLog(res.deploy.id);
			void qc.invalidateQueries({ queryKey: ['deploys', name] });
		},
	});

	if (project.isLoading) return <Spinner />;
	if (project.error) return <Alert variant="danger">{(project.error as Error).message}</Alert>;
	const p = project.data!.project;
	const updateAvailable = (updates.data?.updates ?? []).some((u) => u.updateAvailable);

	return (
		<>
			<div className="row">
				<h1 style={{ flex: 1 }}>{p.name}</h1>
				<Button variant="primary" onClick={() => run.mutate('deploy')} disabled={run.isPending}>
					Deploy
				</Button>
				<Button
					variant={updateAvailable ? 'accent' : 'default'}
					onClick={() => run.mutate('update')}
					disabled={run.isPending}
					title="Pull newest images and recreate changed containers (no git sync)"
				>
					{updateAvailable ? 'Update ⬆' : 'Update'}
				</Button>
				<Button onClick={() => run.mutate('restart')} disabled={run.isPending}>
					Restart
				</Button>
				<a href={`#/projects/${p.name}/edit`} className="icon-btn" title="Edit project">
					<span className="material-symbols-outlined">edit</span>
				</a>
			</div>
			<p className="muted">
				{p.gitUrl} ({p.branch}) — target: {p.target.type}
				{p.target.profiles?.length ? ` [${p.target.profiles.join(', ')}]` : ''} — auto-deploy:{' '}
				{p.autoDeploy ? 'on' : 'off'}
			</p>
			{run.isError && <Alert variant="danger">{(run.error as Error).message}</Alert>}

			<h2>Services</h2>
			<Card className="panel">
				{status.error && <Alert variant="danger">{(status.error as Error).message}</Alert>}
				{status.data?.services.length === 0 && <p className="muted">No services — never deployed?</p>}
				{!!status.data?.services.length && (
					<table className="nb-table">
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
										<Badge variant={stateVariant(s.state)}>{s.state}</Badge>
									</td>
									<td className="muted">{s.status}</td>
									<td className="muted">{s.image}</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</Card>

			{p.images.length > 0 && (
				<>
					<h2>Images</h2>
					<Card className="panel">
						<table className="nb-table">
							<tbody>
								{(updates.data?.updates ?? []).map((u) => (
									<tr key={u.image}>
										<td>{u.image}</td>
										<td>
											{u.error ? (
												<Badge variant="warning" title={u.error}>
													check failed
												</Badge>
											) : u.updateAvailable ? (
												<Badge variant="warning">update available</Badge>
											) : (
												<Badge variant="success">up to date</Badge>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</Card>
				</>
			)}

			<h2>Deploy history</h2>
			<Card className="panel">
				{deploys.data?.deploys.length === 0 && <p className="muted">No deploys yet.</p>}
				{!!deploys.data?.deploys.length && (
					<table className="nb-table">
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
										<Badge
											variant={
												d.status === 'succeeded'
													? 'success'
													: d.status === 'failed'
														? 'danger'
														: 'warning'
											}
										>
											{d.status}
										</Badge>
									</td>
									<td className="muted">{new Date(d.startedAt).toLocaleString()}</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
				{openLog !== null && <DeployLog project={name} id={openLog} />}
			</Card>
		</>
	);
}
