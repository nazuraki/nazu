import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Field, Input } from '@nazuraki/ui-react';
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
			<Card className="panel login">
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
					<Field label="Email" htmlFor="setup-email">
						<Input id="setup-email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
					</Field>
					<Field label="Name (optional)" htmlFor="setup-name">
						<Input id="setup-name" value={name} onChange={(e) => setName(e.target.value)} />
					</Field>
					<Field label="Username" htmlFor="setup-user">
						<Input id="setup-user" value={username} onChange={(e) => setUsername(e.target.value)} />
					</Field>
					<Field label="Password" htmlFor="setup-pass">
						<Input
							id="setup-pass"
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
						/>
					</Field>
					{doSetup.isError && <Alert variant="danger">{doSetup.error.message}</Alert>}
					<Button variant="primary" disabled={doSetup.isPending || !email || !username || !password}>
						Create admin
					</Button>
				</form>
			</Card>
		</main>
	);
}
