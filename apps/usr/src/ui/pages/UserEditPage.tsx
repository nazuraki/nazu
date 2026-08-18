import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { deleteUser, fetchRoles, fetchUser, setUserRoles } from '../api';

/** Admin view of one user: identity, profile fields, per-app role assignment. */
export function UserEditPage({ id }: { id: number }): React.JSX.Element {
	const qc = useQueryClient();
	const user = useQuery({ queryKey: ['users', id], queryFn: () => fetchUser(id) });
	const roles = useQuery({ queryKey: ['roles'], queryFn: fetchRoles });

	const invalidate = (): void => {
		void qc.invalidateQueries({ queryKey: ['users'] });
	};

	const toggleRole = useMutation({
		mutationFn: (roleId: number) => {
			const current = user.data?.roles.map((r) => r.id) ?? [];
			const next = current.includes(roleId)
				? current.filter((r) => r !== roleId)
				: [...current, roleId];
			return setUserRoles(id, next);
		},
		onSuccess: invalidate,
	});

	const remove = useMutation({
		mutationFn: () => deleteUser(id),
		onSuccess: () => {
			invalidate();
			window.location.hash = '#/users';
		},
	});

	if (user.isPending || roles.isPending) return <p className="muted">loading…</p>;
	if (user.isError) return <p className="error">{user.error.message}</p>;
	if (roles.isError) return <p className="error">{roles.error.message}</p>;

	const assigned = new Set(user.data.roles.map((r) => r.id));
	const apps = [...new Set(roles.data.map((r) => r.app))].sort();

	return (
		<>
			<h1>{user.data.email}</h1>
			<div className="panel">
				<div className="row">
					<span className="muted">
						{user.data.displayName ?? user.data.name ?? 'no name'} · created{' '}
						{new Date(user.data.createdAt).toLocaleDateString()} ·{' '}
						{user.data.lastLoginAt
							? `last login ${new Date(user.data.lastLoginAt).toLocaleString()}`
							: 'never logged in'}
					</span>
					<span className="spacer" style={{ flex: 1 }} />
					<button
						className="danger"
						onClick={() => {
							if (window.confirm(`Delete ${user.data.email}?`)) remove.mutate();
						}}
						disabled={remove.isPending}
					>
						Delete user
					</button>
				</div>
			</div>
			<h2>Roles</h2>
			{apps.length === 0 && (
				<p className="muted">
					No roles defined yet — create some under <a href="#/roles">Roles</a>.
				</p>
			)}
			{apps.map((app) => (
				<div key={app} className="panel">
					<label>{app}</label>
					{roles.data
						.filter((r) => r.app === app)
						.map((r) => (
							<div key={r.id} className="row" style={{ margin: '0.35rem 0' }}>
								<input
									type="checkbox"
									checked={assigned.has(r.id)}
									onChange={() => toggleRole.mutate(r.id)}
									disabled={toggleRole.isPending}
								/>
								<span>{r.name}</span>
								<span className="chip-row">
									{r.permissions.map((p) => (
										<span key={p} className="badge">
											{p}
										</span>
									))}
								</span>
							</div>
						))}
				</div>
			))}
			{toggleRole.isError && <p className="error">{toggleRole.error.message}</p>}
		</>
	);
}
