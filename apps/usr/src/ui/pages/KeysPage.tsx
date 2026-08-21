import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, Checkbox, Input, Spinner } from '@nazuraki/ui-react';
import { useState } from 'react';

import { createKey, deleteKey, fetchKeys, fetchRoles, setKeyRoles, type ApiKey } from '../api';

function KeyRow({ apiKey }: { apiKey: ApiKey }): React.JSX.Element {
	const qc = useQueryClient();
	const roles = useQuery({ queryKey: ['roles'], queryFn: fetchRoles });
	const [editing, setEditing] = useState(false);

	const invalidate = (): void => {
		void qc.invalidateQueries({ queryKey: ['keys'] });
	};

	const toggleRole = useMutation({
		mutationFn: (roleId: number) => {
			const current = apiKey.roles.map((r) => r.id);
			const next = current.includes(roleId)
				? current.filter((r) => r !== roleId)
				: [...current, roleId];
			return setKeyRoles(apiKey.id, next);
		},
		onSuccess: invalidate,
	});

	const remove = useMutation({ mutationFn: () => deleteKey(apiKey.id), onSuccess: invalidate });
	const assigned = new Set(apiKey.roles.map((r) => r.id));

	return (
		<tr>
			<td>{apiKey.name}</td>
			<td>
				{editing && roles.data ? (
					<span className="chip-row">
						{roles.data.map((r) => (
							<Checkbox
								key={r.id}
								checked={assigned.has(r.id)}
								onChange={() => toggleRole.mutate(r.id)}
								disabled={toggleRole.isPending}
								label={`${r.app}/${r.name}`}
							/>
						))}
					</span>
				) : (
					<span className="chip-row">
						{apiKey.roles.map((r) => (
							<Badge key={r.id} variant="primary">
								{r.app}/{r.name}
							</Badge>
						))}
						{apiKey.roles.length === 0 && <span className="muted">none</span>}
					</span>
				)}
				{(toggleRole.isError || remove.isError) && (
					<span className="error">{(toggleRole.error ?? remove.error)?.message}</span>
				)}
			</td>
			<td>
				{apiKey.lastUsedAt ? new Date(apiKey.lastUsedAt).toLocaleString() : <Badge>never</Badge>}
			</td>
			<td>
				<div className="row">
					<Button onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Roles'}</Button>
					<Button
						variant="danger"
						onClick={() => {
							if (window.confirm(`Revoke key "${apiKey.name}"?`)) remove.mutate();
						}}
						disabled={remove.isPending}
					>
						Revoke
					</Button>
				</div>
			</td>
		</tr>
	);
}

export function KeysPage(): React.JSX.Element {
	const qc = useQueryClient();
	const keys = useQuery({ queryKey: ['keys'], queryFn: fetchKeys });
	const [name, setName] = useState('');
	const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null);

	const create = useMutation({
		mutationFn: () => createKey(name, []),
		onSuccess: (key) => {
			setName('');
			setNewToken({ name: key.name, token: key.token });
			void qc.invalidateQueries({ queryKey: ['keys'] });
		},
	});

	if (keys.isPending) return <Spinner />;
	if (keys.isError) return <Alert variant="danger">{keys.error.message}</Alert>;

	return (
		<>
			<h1>API keys</h1>
			<p className="muted">
				Machine identities for other apps — role-mapped like users. Give app keys the{' '}
				<code>usr/service</code> role so they can query permissions.
			</p>
			<Card className="panel">
				<form
					className="row"
					onSubmit={(e) => {
						e.preventDefault();
						create.mutate();
					}}
				>
					<Input
						style={{ flex: 1, maxWidth: '20rem' }}
						placeholder="key name, e.g. nazu-web"
						aria-label="Key name"
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
					<Button variant="primary" disabled={create.isPending || !name}>
						Create key
					</Button>
					{create.isError && <span className="error">{create.error.message}</span>}
				</form>
				{newToken && (
					<Alert variant="success" title={newToken.name}>
						<code>{newToken.token}</code>
						<br />
						<span className="muted">Copy it now — it is shown only once.</span>
					</Alert>
				)}
			</Card>
			<Card className="panel">
				<table className="nb-table">
					<thead>
						<tr>
							<th>Name</th>
							<th>Roles</th>
							<th>Last used</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{keys.data.map((k) => (
							<KeyRow key={k.id} apiKey={k} />
						))}
					</tbody>
				</table>
				{keys.data.length === 0 && <p className="muted">No keys yet.</p>}
			</Card>
		</>
	);
}
