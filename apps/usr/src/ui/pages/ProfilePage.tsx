import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { fetchProfile, saveProfile, type ProfileInput } from '../api';

export function ProfilePage(): React.JSX.Element {
	const qc = useQueryClient();
	const profile = useQuery({ queryKey: ['profile'], queryFn: fetchProfile });
	const [draft, setDraft] = useState<ProfileInput | null>(null);

	const save = useMutation({
		mutationFn: (input: ProfileInput) => saveProfile(input),
		onSuccess: () => {
			setDraft(null);
			void qc.invalidateQueries({ queryKey: ['profile'] });
		},
	});

	if (profile.isPending) return <p className="muted">loading…</p>;
	if (profile.isError) return <p className="error">{profile.error.message}</p>;

	const p = profile.data;
	const d = draft ?? {
		name: p.name ?? '',
		displayName: p.displayName ?? '',
		avatarUrl: p.avatarUrl ?? '',
		timezone: p.timezone ?? '',
	};

	return (
		<>
			<h1>Profile</h1>
			<div className="panel">
				<label>Email</label>
				<p>{p.email}</p>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						save.mutate(d);
					}}
				>
					<label>Name</label>
					<input value={d.name} onChange={(e) => setDraft({ ...d, name: e.target.value })} />
					<label>Display name</label>
					<input
						value={d.displayName}
						onChange={(e) => setDraft({ ...d, displayName: e.target.value })}
					/>
					<label>Avatar URL</label>
					<input
						value={d.avatarUrl}
						onChange={(e) => setDraft({ ...d, avatarUrl: e.target.value })}
					/>
					<label>Timezone</label>
					<input
						value={d.timezone}
						placeholder="e.g. America/New_York"
						onChange={(e) => setDraft({ ...d, timezone: e.target.value })}
					/>
					<div className="row" style={{ marginTop: '0.75rem' }}>
						<button type="submit" disabled={save.isPending || draft === null}>
							Save
						</button>
						{save.isError && <span className="error">{save.error.message}</span>}
					</div>
				</form>
			</div>
			<h2>My access</h2>
			<div className="panel">
				{p.roles.length === 0 && <p className="muted">No roles assigned.</p>}
				{p.roles.map((r) => (
					<div key={r.id} className="chip-row">
						<span className="badge accent">
							{r.app}/{r.name}
						</span>
						{r.permissions.map((perm) => (
							<span key={perm} className="badge">
								{perm}
							</span>
						))}
					</div>
				))}
			</div>
		</>
	);
}
