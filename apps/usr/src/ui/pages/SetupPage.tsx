import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { setup } from '../api';

/** First-run welcome: create the initial admin user + local credentials. */
export function SetupPage(): React.JSX.Element {
	const qc = useQueryClient();
	const [email, setEmail] = useState('');
	const [name, setName] = useState('');
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');

	const doSetup = useMutation({
		mutationFn: () => setup({ email, name: name || undefined, username, password }),
		onSuccess: () => void qc.invalidateQueries(),
	});

	return (
		<main>
			<div className="panel login">
				<h1>Welcome to usr</h1>
				<p className="muted">
					Fresh install — create the initial admin. This makes a user with the{' '}
					<code>usr/admin</code> role and links these credentials to it.
				</p>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						doSetup.mutate();
					}}
				>
					<label>Email</label>
					<input value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
					<label>Name (optional)</label>
					<input value={name} onChange={(e) => setName(e.target.value)} />
					<label>Username</label>
					<input value={username} onChange={(e) => setUsername(e.target.value)} />
					<label>Password</label>
					<input
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
					/>
					<div className="row" style={{ marginTop: '0.75rem' }}>
						<button type="submit" disabled={doSetup.isPending || !email || !username || !password}>
							Create admin
						</button>
						{doSetup.isError && <span className="error">{doSetup.error.message}</span>}
					</div>
				</form>
			</div>
		</main>
	);
}
