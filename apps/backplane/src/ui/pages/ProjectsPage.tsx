import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, Checkbox, Field, Input, NavLink, Spinner } from '@nazuraki/ui-react';
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
	variant: 'success' | 'warning' | 'danger' | undefined;
	uptime: string | null;
}

function projectHealth(p: Project, containers: ContainerSummary[] | undefined): ProjectHealth {
	if (!containers) return { label: 'unknown', variant: undefined, uptime: null };
	const compose = p.target.projectName ?? p.name;
	const own = containers.filter((c) => c.composeProject === compose);
	const running = own.filter((c) => c.state === 'running');
	if (own.length === 0) return { label: 'not deployed', variant: undefined, uptime: null };
	// The stack is only fully up since its most recently started container.
	const uptime =
		running.length > 0
			? formatUptime(Date.now() / 1000 - Math.max(...running.map((c) => c.created)))
			: null;
	if (running.length === own.length) return { label: 'running', variant: 'success', uptime };
	if (running.length > 0) return { label: `${running.length}/${own.length} running`, variant: 'warning', uptime };
	return { label: 'stopped', variant: 'danger', uptime: null };
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

	if (!open) {
		return (
			<Button variant="primary" onClick={() => setOpen(true)}>
				+ Add project
			</Button>
		);
	}

	const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
		setForm({ ...form, [k]: k === 'autoDeploy' ? e.target.checked : e.target.value });

	return (
		<Card className="panel">
			<Field label="Name" htmlFor="f-name">
				<Input id="f-name" value={form.name} onChange={set('name')} placeholder="nazu" />
			</Field>
			<Field label="Git URL" htmlFor="f-gitUrl">
				<Input id="f-gitUrl" value={form.gitUrl} onChange={set('gitUrl')} placeholder="https://github.com/user/repo.git" />
			</Field>
			<Field label="Branch" htmlFor="f-branch">
				<Input id="f-branch" value={form.branch} onChange={set('branch')} />
			</Field>
			<Field label="Watched images (comma-separated)" htmlFor="f-images">
				<Input id="f-images" value={form.images} onChange={set('images')} placeholder="ghcr.io/user/image:latest" />
			</Field>
			<Field label="Compose files (comma-separated, optional)" htmlFor="f-composeFiles">
				<Input id="f-composeFiles" value={form.composeFiles} onChange={set('composeFiles')} placeholder="docker-compose.yml" />
			</Field>
			<Field label="Compose profiles (comma-separated, optional)" htmlFor="f-profiles">
				<Input id="f-profiles" value={form.profiles} onChange={set('profiles')} placeholder="tls,discord" />
			</Field>
			<Checkbox
					checked={form.autoDeploy}
					onChange={set('autoDeploy')}
					label="auto-deploy on new image"
				/>
			<div className="row" style={{ marginTop: '0.75rem' }}>
				<Button variant="primary" onClick={() => create.mutate()} disabled={create.isPending}>
					Create
				</Button>
				<Button onClick={() => setOpen(false)}>Cancel</Button>
				{create.isError && <span className="error">{(create.error as Error).message}</span>}
			</div>
		</Card>
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
			{isLoading && <Spinner />}
			{error && <Alert variant="danger">{(error as Error).message}</Alert>}
			{data && data.projects.length === 0 && (
				<p className="muted">No projects registered yet. Add one to start deploying.</p>
			)}
			{data && data.projects.length > 0 && (
				<div className="card-stack">
					{data.projects.map((p) => {
						const health = projectHealth(p, containers.data?.containers);
						return (
							<NavLink key={p.name} className="project-card" href={`#/projects/${p.name}`}>
								<span className="project-card-name">{p.name}</span>
								<span className="project-card-uptime muted">
									{health.uptime ? `up ${health.uptime}` : '—'}
								</span>
								<Badge variant={health.variant}>{health.label}</Badge>
							</NavLink>
						);
					})}
				</div>
			)}
		</>
	);
}
