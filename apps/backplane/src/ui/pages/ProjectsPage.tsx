import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { api, type Project } from '../api';

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
				<div className="panel">
					<table>
						<thead>
							<tr>
								<th>Name</th>
								<th>Repo</th>
								<th>Branch</th>
								<th>Images watched</th>
								<th>Auto-deploy</th>
							</tr>
						</thead>
						<tbody>
							{data.projects.map((p) => (
								<tr
									key={p.name}
									className="clickable"
									onClick={() => (window.location.hash = `#/projects/${p.name}`)}
								>
									<td>
										<a href={`#/projects/${p.name}`}>{p.name}</a>
									</td>
									<td className="muted">{p.gitUrl}</td>
									<td>{p.branch}</td>
									<td>{p.images.length}</td>
									<td>{p.autoDeploy ? <span className="badge ok">on</span> : <span className="badge">off</span>}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</>
	);
}
