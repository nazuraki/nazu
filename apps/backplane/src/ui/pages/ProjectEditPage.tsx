import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Checkbox, Field, Input, Spinner } from '@nazuraki/ui-react';
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
			<Card className="panel">
				<Field label="Git URL" htmlFor="f-gitUrl">
					<Input id="f-gitUrl" value={form.gitUrl} onChange={set('gitUrl')} />
				</Field>
				<Field label="Branch" htmlFor="f-branch">
					<Input id="f-branch" value={form.branch} onChange={set('branch')} />
				</Field>
				<Field label="Watched images (comma-separated)" htmlFor="f-images">
					<Input id="f-images" value={form.images} onChange={set('images')} placeholder="ghcr.io/user/image:latest" />
				</Field>
				<Field label="Compose project name (optional, defaults to project name)" htmlFor="f-projectName">
					<Input id="f-projectName" value={form.projectName} onChange={set('projectName')} placeholder={project.name} />
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
					<Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
						Save
					</Button>
					<Button onClick={() => (window.location.hash = `#/projects/${project.name}`)}>Cancel</Button>
					{save.isError && <span className="error">{(save.error as Error).message}</span>}
				</div>
			</Card>

			<div className="row" style={{ marginTop: '2.5rem' }}>
				<Button
					variant="danger"
					onClick={() => {
						if (window.confirm(`Remove project "${project.name}" from the registry?`)) remove.mutate();
					}}
					disabled={remove.isPending}
				>
					Remove project
				</Button>
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

	if (project.isLoading) return <Spinner />;
	if (project.error) return <Alert variant="danger">{(project.error as Error).message}</Alert>;

	return (
		<>
			<h1>Edit {name}</h1>
			<EditForm project={project.data!.project} />
		</>
	);
}
