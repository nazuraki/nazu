import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
					<input
						value={perms}
						onChange={(e) => setPerms(e.target.value)}
						placeholder="space-separated permissions"
					/>
				) : (
					<span className="chip-row">
						{role.permissions.map((p) => (
							<span key={p} className="badge">
								{p}
							</span>
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
						<button onClick={() => save.mutate()} disabled={save.isPending}>
							Save
						</button>
					) : (
						<button onClick={() => setEditing(true)}>Edit</button>
					)}
					<button
						className="danger"
						onClick={() => {
							if (window.confirm(`Delete role ${role.app}/${role.name}?`)) remove.mutate();
						}}
						disabled={remove.isPending}
					>
						Delete
					</button>
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

	if (roles.isPending) return <p className="muted">loading…</p>;
	if (roles.isError) return <p className="error">{roles.error.message}</p>;

	return (
		<>
			<h1>Roles</h1>
			<div className="panel">
				<form
					className="row"
					onSubmit={(e) => {
						e.preventDefault();
						create.mutate();
					}}
				>
					<input
						style={{ width: '10rem' }}
						placeholder="app"
						value={app}
						onChange={(e) => setApp(e.target.value)}
					/>
					<input
						style={{ width: '10rem' }}
						placeholder="role name"
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
					<input
						style={{ flex: 1, minWidth: '12rem' }}
						placeholder="permissions (space-separated)"
						value={perms}
						onChange={(e) => setPerms(e.target.value)}
					/>
					<button type="submit" disabled={create.isPending || !app || !name}>
						Add role
					</button>
					{create.isError && <span className="error">{create.error.message}</span>}
				</form>
			</div>
			<div className="panel">
				<table>
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
			</div>
		</>
	);
}
