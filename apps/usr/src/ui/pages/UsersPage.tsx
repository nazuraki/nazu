import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

	if (users.isPending) return <p className="muted">loading…</p>;
	if (users.isError) return <p className="error">{users.error.message}</p>;

	return (
		<>
			<h1>Users</h1>
			<div className="panel">
				<form
					className="row"
					onSubmit={(e) => {
						e.preventDefault();
						create.mutate();
					}}
				>
					<input
						style={{ flex: 1, maxWidth: '24rem' }}
						placeholder="email — pre-provision a user"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
					/>
					<button type="submit" disabled={create.isPending || !email}>
						Add user
					</button>
					{create.isError && <span className="error">{create.error.message}</span>}
				</form>
			</div>
			<div className="panel">
				<table>
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
									{u.lastLoginAt ? (
										new Date(u.lastLoginAt).toLocaleString()
									) : (
										<span className="badge">never</span>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
				{users.data.length === 0 && <p className="muted">No users yet — add one above.</p>}
			</div>
		</>
	);
}
