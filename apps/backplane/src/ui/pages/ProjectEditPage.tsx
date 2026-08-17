import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { api, type Project } from '../api';

const csv = (s: string): string[] =>
	s
		.split(',')
		.map((x) => x.trim())
		.filter(Boolean);

function EditForm({ project }: { project: Project }): React.JSX.Element {
	const [form, setForm] = useState({
		gitUrl: project.gitUrl,
		branch: project.branch,
		images: project.images.join(', '),
		projectName: project.target.projectName ?? '',
		composeFiles: (project.target.composeFiles ?? []).join(', '),
		profiles: (project.target.profiles ?? []).join(', '),
		autoDeploy: project.autoDeploy,
	});
	const qc = useQueryClient();

	const save = useMutation({
		mutationFn: async () => {
			await api('/api/projects', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name: project.name,
					gitUrl: form.gitUrl.trim(),
					branch: form.branch.trim() || 'main',
					images: csv(form.images),
					target: {
						type: 'compose',
						projectName: form.projectName.trim() || undefined,
						composeFiles: csv(form.composeFiles).length ? csv(form.composeFiles) : undefined,
						profiles: csv(form.profiles).length ? csv(form.profiles) : undefined,
					},
					autoDeploy: form.autoDeploy,
				}),
			});
		},
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: ['project', project.name] });
			void qc.invalidateQueries({ queryKey: ['projects'] });
			window.location.hash = `#/projects/${project.name}`;
		},
	});

	const remove = useMutation({
		mutationFn: () => api(`/api/projects/${project.name}`, { method: 'DELETE' }),
		onSuccess: () => {
			window.location.hash = '#/projects';
		},
	});

	const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
		setForm({ ...form, [k]: k === 'autoDeploy' ? e.target.checked : e.target.value });

	return (
		<>
			<div className="panel">
				<label>Git URL</label>
				<input value={form.gitUrl} onChange={set('gitUrl')} />
				<label>Branch</label>
				<input value={form.branch} onChange={set('branch')} />
				<label>Watched images (comma-separated)</label>
				<input value={form.images} onChange={set('images')} placeholder="ghcr.io/user/image:latest" />
				<label>Compose project name (optional, defaults to project name)</label>
				<input value={form.projectName} onChange={set('projectName')} placeholder={project.name} />
				<label>Compose files (comma-separated, optional)</label>
				<input value={form.composeFiles} onChange={set('composeFiles')} placeholder="docker-compose.yml" />
				<label>Compose profiles (comma-separated, optional)</label>
				<input value={form.profiles} onChange={set('profiles')} placeholder="tls,discord" />
				<label>
					<input type="checkbox" checked={form.autoDeploy} onChange={set('autoDeploy')} /> auto-deploy
					on new image
				</label>
				<div className="row" style={{ marginTop: '0.75rem' }}>
					<button onClick={() => save.mutate()} disabled={save.isPending}>
						Save
					</button>
					<button onClick={() => (window.location.hash = `#/projects/${project.name}`)}>Cancel</button>
					{save.isError && <span className="error">{(save.error as Error).message}</span>}
				</div>
			</div>

			<div className="row" style={{ marginTop: '2.5rem' }}>
				<button
					className="danger"
					onClick={() => {
						if (window.confirm(`Remove project "${project.name}" from the registry?`)) remove.mutate();
					}}
					disabled={remove.isPending}
				>
					Remove project
				</button>
				{remove.isError && <span className="error">{(remove.error as Error).message}</span>}
			</div>
		</>
	);
}

export function ProjectEditPage({ name }: { name: string }): React.JSX.Element {
	const project = useQuery({
		queryKey: ['project', name],
		queryFn: () => api<{ project: Project }>(`/api/projects/${name}`),
	});

	if (project.isLoading) return <p className="muted">Loading…</p>;
	if (project.error) return <p className="error">{(project.error as Error).message}</p>;

	return (
		<>
			<h1>Edit {name}</h1>
			<EditForm project={project.data!.project} />
		</>
	);
}
