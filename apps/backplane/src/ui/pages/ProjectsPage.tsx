import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { api, type ContainerSummary, type Project } from '../api';

function formatUptime(seconds: number): string {
	const d = Math.floor(seconds / 86_400);
	const h = Math.floor((seconds % 86_400) / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	if (d > 0) return `${d}d ${h}h`;
	if (h > 0) return `${h}h ${m}m`;
	return `${m}m`;
}

interface ProjectHealth {
	label: string;
	cls: '' | 'ok' | 'warn' | 'err';
	uptime: string | null;
}

function projectHealth(p: Project, containers: ContainerSummary[] | undefined): ProjectHealth {
	if (!containers) return { label: 'unknown', cls: '', uptime: null };
	const compose = p.target.projectName ?? p.name;
	const own = containers.filter((c) => c.composeProject === compose);
	const running = own.filter((c) => c.state === 'running');
	if (own.length === 0) return { label: 'not deployed', cls: '', uptime: null };
	// The stack is only fully up since its most recently started container.
	const uptime =
		running.length > 0
			? formatUptime(Date.now() / 1000 - Math.max(...running.map((c) => c.created)))
			: null;
	if (running.length === own.length) return { label: 'running', cls: 'ok', uptime };
	if (running.length > 0) return { label: `${running.length}/${own.length} running`, cls: 'warn', uptime };
	return { label: 'stopped', cls: 'err', uptime: null };
}

const EMPTY = {
	name: '',
	gitUrl: '',
	branch: 'main',
	images: '',
	composeFiles: '',
	profiles: '',
	autoDeploy: false,
};

function AddProjectForm(): React.JSX.Element {
	const [form, setForm] = useState(EMPTY);
	const [open, setOpen] = useState(false);
	const qc = useQueryClient();

	const create = useMutation({
		mutationFn: async () => {
			const csv = (s: string): string[] =>
				s
					.split(',')
					.map((x) => x.trim())
					.filter(Boolean);
			await api('/api/projects', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name: form.name.trim(),
					gitUrl: form.gitUrl.trim(),
					branch: form.branch.trim() || 'main',
					images: csv(form.images),
					target: {
						type: 'compose',
						composeFiles: csv(form.composeFiles).length ? csv(form.composeFiles) : undefined,
						profiles: csv(form.profiles).length ? csv(form.profiles) : undefined,
					},
					autoDeploy: form.autoDeploy,
				}),
			});
		},
		onSuccess: () => {
			setForm(EMPTY);
			setOpen(false);
			void qc.invalidateQueries({ queryKey: ['projects'] });
		},
	});

	if (!open) return <button onClick={() => setOpen(true)}>+ Add project</button>;

	const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
		setForm({ ...form, [k]: k === 'autoDeploy' ? e.target.checked : e.target.value });

	return (
		<div className="panel">
			<label>Name</label>
			<input value={form.name} onChange={set('name')} placeholder="nazu" />
			<label>Git URL</label>
			<input value={form.gitUrl} onChange={set('gitUrl')} placeholder="https://github.com/user/repo.git" />
			<label>Branch</label>
			<input value={form.branch} onChange={set('branch')} />
			<label>Watched images (comma-separated)</label>
			<input value={form.images} onChange={set('images')} placeholder="ghcr.io/user/image:latest" />
			<label>Compose files (comma-separated, optional)</label>
			<input value={form.composeFiles} onChange={set('composeFiles')} placeholder="docker-compose.yml" />
			<label>Compose profiles (comma-separated, optional)</label>
			<input value={form.profiles} onChange={set('profiles')} placeholder="tls,discord" />
			<label>
				<input type="checkbox" checked={form.autoDeploy} onChange={set('autoDeploy')} /> auto-deploy on
				new image
			</label>
			<div className="row" style={{ marginTop: '0.75rem' }}>
				<button onClick={() => create.mutate()} disabled={create.isPending}>
					Create
				</button>
				<button onClick={() => setOpen(false)}>Cancel</button>
				{create.isError && <span className="error">{(create.error as Error).message}</span>}
			</div>
		</div>
	);
}

export function ProjectsPage(): React.JSX.Element {
	const { data, error, isLoading } = useQuery({
		queryKey: ['projects'],
		queryFn: () => api<{ projects: Project[] }>('/api/projects'),
		refetchInterval: 15_000,
	});
	// Status/uptime is best-effort: cards render without it if this fails.
	const containers = useQuery({
		queryKey: ['containers'],
		queryFn: () => api<{ containers: ContainerSummary[] }>('/api/containers'),
		refetchInterval: 15_000,
	});

	return (
		<>
			<div className="row">
				<h1 style={{ flex: 1 }}>Projects</h1>
				<AddProjectForm />
			</div>
			{isLoading && <p className="muted">Loading…</p>}
			{error && <p className="error">{(error as Error).message}</p>}
			{data && data.projects.length === 0 && (
				<p className="muted">No projects registered yet. Add one to start deploying.</p>
			)}
			{data && data.projects.length > 0 && (
				<div className="card-stack">
					{data.projects.map((p) => {
						const health = projectHealth(p, containers.data?.containers);
						return (
							<a key={p.name} className="project-card" href={`#/projects/${p.name}`}>
								<span className="project-card-name">{p.name}</span>
								<span className="project-card-uptime muted">
								{health.uptime ? `up ${health.uptime}` : '—'}
							</span>
								<span className={`badge ${health.cls}`}>{health.label}</span>
							</a>
						);
					})}
				</div>
			)}
		</>
	);
}
