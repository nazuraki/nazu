import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, Checkbox, Label, Spinner } from '@nazuraki/ui-react';

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

	if (user.isPending || roles.isPending) return <Spinner />;
	if (user.isError) return <Alert variant="danger">{user.error.message}</Alert>;
	if (roles.isError) return <Alert variant="danger">{roles.error.message}</Alert>;

	const assigned = new Set(user.data.roles.map((r) => r.id));
	const apps = [...new Set(roles.data.map((r) => r.app))].sort();

	return (
		<>
			<h1>{user.data.email}</h1>
			<Card className="panel">
				<div className="row">
					<span className="muted">
						{user.data.displayName ?? user.data.name ?? 'no name'} · created{' '}
						{new Date(user.data.createdAt).toLocaleDateString()} ·{' '}
						{user.data.lastLoginAt
							? `last login ${new Date(user.data.lastLoginAt).toLocaleString()}`
							: 'never logged in'}
					</span>
					<span className="spacer" style={{ flex: 1 }} />
					<Button
						variant="danger"
						onClick={() => {
							if (window.confirm(`Delete ${user.data.email}?`)) remove.mutate();
						}}
						disabled={remove.isPending}
					>
						Delete user
					</Button>
				</div>
			</Card>
			<h2>Roles</h2>
			{apps.length === 0 && (
				<p className="muted">
					No roles defined yet — create some under <a href="#/roles">Roles</a>.
				</p>
			)}
			{apps.map((app) => (
				<Card key={app} className="panel">
					<Label>{app}</Label>
					{roles.data
						.filter((r) => r.app === app)
						.map((r) => (
							<div key={r.id} className="row" style={{ margin: '0.35rem 0' }}>
								<Checkbox
									checked={assigned.has(r.id)}
									onChange={() => toggleRole.mutate(r.id)}
									disabled={toggleRole.isPending}
									label={r.name}
								/>
								<span className="chip-row">
									{r.permissions.map((p) => (
										<Badge key={p}>{p}</Badge>
									))}
								</span>
							</div>
						))}
				</Card>
			))}
			{toggleRole.isError && <Alert variant="danger">{toggleRole.error.message}</Alert>}
			{remove.isError && <Alert variant="danger">{remove.error.message}</Alert>}
		</>
	);
}
