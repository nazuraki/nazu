import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, Input, Spinner } from '@nazuraki/ui-react';
import { useState } from 'react';

import { createRole, deleteRole, fetchRoles, updateRole, type Role } from '../api';

function RoleRow({ role }: { role: Role }): React.JSX.Element {
	const qc = useQueryClient();
	const [editing, setEditing] = useState(false);
	const [perms, setPerms] = useState(role.permissions.join(' '));

	const invalidate = (): void => {
		void qc.invalidateQueries({ queryKey: ['roles'] });
	};

	const save = useMutation({
		mutationFn: () => updateRole(role.id, { permissions: perms.split(/[\s,]+/).filter(Boolean) }),
		onSuccess: () => {
			setEditing(false);
			invalidate();
		},
	});

	const remove = useMutation({ mutationFn: () => deleteRole(role.id), onSuccess: invalidate });

	return (
		<tr>
			<td>{role.app}</td>
			<td>{role.name}</td>
			<td>
				{editing ? (
					<Input
						value={perms}
						onChange={(e) => setPerms(e.target.value)}
						placeholder="space-separated permissions"
						aria-label="Permissions"
					/>
				) : (
					<span className="chip-row">
						{role.permissions.map((p) => (
							<Badge key={p}>{p}</Badge>
						))}
						{role.permissions.length === 0 && <span className="muted">none</span>}
					</span>
				)}
				{(save.isError || remove.isError) && (
					<span className="error">{(save.error ?? remove.error)?.message}</span>
				)}
			</td>
			<td>
				<div className="row">
					{editing ? (
						<Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
							Save
						</Button>
					) : (
						<Button onClick={() => setEditing(true)}>Edit</Button>
					)}
					<Button
						variant="danger"
						onClick={() => {
							if (window.confirm(`Delete role ${role.app}/${role.name}?`)) remove.mutate();
						}}
						disabled={remove.isPending}
					>
						Delete
					</Button>
				</div>
			</td>
		</tr>
	);
}

export function RolesPage(): React.JSX.Element {
	const qc = useQueryClient();
	const roles = useQuery({ queryKey: ['roles'], queryFn: fetchRoles });
	const [app, setApp] = useState('');
	const [name, setName] = useState('');
	const [perms, setPerms] = useState('');

	const create = useMutation({
		mutationFn: () =>
			createRole({ app, name, permissions: perms.split(/[\s,]+/).filter(Boolean) }),
		onSuccess: () => {
			setName('');
			setPerms('');
			void qc.invalidateQueries({ queryKey: ['roles'] });
		},
	});

	if (roles.isPending) return <Spinner />;
	if (roles.isError) return <Alert variant="danger">{roles.error.message}</Alert>;

	return (
		<>
			<h1>Roles</h1>
			<Card className="panel">
				<form
					className="row"
					onSubmit={(e) => {
						e.preventDefault();
						create.mutate();
					}}
				>
					<Input
						style={{ width: '10rem' }}
						placeholder="app"
						aria-label="App"
						value={app}
						onChange={(e) => setApp(e.target.value)}
					/>
					<Input
						style={{ width: '10rem' }}
						placeholder="role name"
						aria-label="Role name"
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
					<Input
						style={{ flex: 1, minWidth: '12rem' }}
						placeholder="permissions (space-separated)"
						aria-label="Permissions"
						value={perms}
						onChange={(e) => setPerms(e.target.value)}
					/>
					<Button variant="primary" disabled={create.isPending || !app || !name}>
						Add role
					</Button>
					{create.isError && <span className="error">{create.error.message}</span>}
				</form>
			</Card>
			<Card className="panel">
				<table className="nb-table">
					<thead>
						<tr>
							<th>App</th>
							<th>Role</th>
							<th>Permissions</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{roles.data.map((r) => (
							<RoleRow key={r.id} role={r} />
						))}
					</tbody>
				</table>
			</Card>
		</>
	);
}
