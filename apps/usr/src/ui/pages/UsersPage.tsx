import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, Input, Spinner } from '@nazuraki/ui-react';
import { useState } from 'react';

import { createUser, fetchUsers } from '../api';

export function UsersPage(): React.JSX.Element {
	const qc = useQueryClient();
	const users = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
	const [email, setEmail] = useState('');

	const create = useMutation({
		mutationFn: () => createUser(email, []),
		onSuccess: (user) => {
			setEmail('');
			void qc.invalidateQueries({ queryKey: ['users'] });
			window.location.hash = `#/users/${user.id}`;
		},
	});

	if (users.isPending) return <Spinner />;
	if (users.isError) return <Alert variant="danger">{users.error.message}</Alert>;

	return (
		<>
			<h1>Users</h1>
			<Card className="panel">
				<form
					className="row"
					onSubmit={(e) => {
						e.preventDefault();
						create.mutate();
					}}
				>
					<Input
						style={{ flex: 1, maxWidth: '24rem' }}
						placeholder="email — pre-provision a user"
						aria-label="Email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
					/>
					<Button variant="primary" disabled={create.isPending || !email}>
						Add user
					</Button>
					{create.isError && <span className="error">{create.error.message}</span>}
				</form>
			</Card>
			<Card className="panel">
				<table className="nb-table">
					<thead>
						<tr>
							<th>Email</th>
							<th>Name</th>
							<th>Last login</th>
						</tr>
					</thead>
					<tbody>
						{users.data.map((u) => (
							<tr
								key={u.id}
								className="clickable"
								onClick={() => (window.location.hash = `#/users/${u.id}`)}
							>
								<td>{u.email}</td>
								<td>{u.displayName ?? u.name ?? <span className="muted">—</span>}</td>
								<td>
									{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : <Badge>never</Badge>}
								</td>
							</tr>
						))}
					</tbody>
				</table>
				{users.data.length === 0 && <p className="muted">No users yet — add one above.</p>}
			</Card>
		</>
	);
}
