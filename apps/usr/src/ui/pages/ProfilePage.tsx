import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, Field, Input, Spinner } from '@nazuraki/ui-react';
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

	if (profile.isPending) return <Spinner />;
	if (profile.isError) return <Alert variant="danger">{profile.error.message}</Alert>;

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
			<Card className="panel">
				<Field label="Email">
					<p style={{ margin: 0 }}>{p.email}</p>
				</Field>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						save.mutate(d);
					}}
				>
					<Field label="Name" htmlFor="pf-name">
						<Input id="pf-name" value={d.name} onChange={(e) => setDraft({ ...d, name: e.target.value })} />
					</Field>
					<Field label="Display name" htmlFor="pf-display">
						<Input
							id="pf-display"
							value={d.displayName}
							onChange={(e) => setDraft({ ...d, displayName: e.target.value })}
						/>
					</Field>
					<Field label="Avatar URL" htmlFor="pf-avatar">
						<Input
							id="pf-avatar"
							value={d.avatarUrl}
							onChange={(e) => setDraft({ ...d, avatarUrl: e.target.value })}
						/>
					</Field>
					<Field label="Timezone" htmlFor="pf-tz">
						<Input
							id="pf-tz"
							value={d.timezone}
							placeholder="e.g. America/New_York"
							onChange={(e) => setDraft({ ...d, timezone: e.target.value })}
						/>
					</Field>
					{save.isError && <Alert variant="danger">{save.error.message}</Alert>}
					<Button variant="primary" disabled={save.isPending || draft === null}>
						Save
					</Button>
				</form>
			</Card>
			<h2>My access</h2>
			<Card className="panel">
				{p.roles.length === 0 && <p className="muted">No roles assigned.</p>}
				{p.roles.map((r) => (
					<div key={r.id} className="chip-row">
						<Badge variant="primary">
							{r.app}/{r.name}
						</Badge>
						{r.permissions.map((perm) => (
							<Badge key={perm}>{perm}</Badge>
						))}
					</div>
				))}
			</Card>
		</>
	);
}
