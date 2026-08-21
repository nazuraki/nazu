import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Field, Input } from '@nazuraki/ui-react';
import { useState } from 'react';

import { getApiKey, login, setApiKey, type AuthStatus } from '../api';

/**
 * Shown instead of the app whenever the API is gated and the browser holds no
 * valid session/key. Offers a credentials form (local admin) and, when only the
 * env bearer key is configured, an API-key field.
 */
export function LoginPage({ status }: { status: AuthStatus }): React.JSX.Element {
	const qc = useQueryClient();
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [key, setKey] = useState(getApiKey());

	const doLogin = useMutation({
		mutationFn: () => login(username, password),
		onSuccess: () => void qc.invalidateQueries({ queryKey: ['auth'] }),
	});

	return (
		<main>
			<Card className="panel login">
				<h1>backplane</h1>
				{status.localAuth && (
					<form
						onSubmit={(e) => {
							e.preventDefault();
							doLogin.mutate();
						}}
					>
						<Field label="Username" htmlFor="login-user">
							<Input
								id="login-user"
								value={username}
								autoFocus
								onChange={(e) => setUsername(e.target.value)}
							/>
						</Field>
						<Field label="Password" htmlFor="login-pass">
							<Input
								id="login-pass"
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
							/>
						</Field>
						{doLogin.isError && <Alert variant="danger">{(doLogin.error as Error).message}</Alert>}
						<Button variant="primary" disabled={doLogin.isPending || !username || !password}>
							Sign in
						</Button>
					</form>
				)}
				{status.apiKeyAuth && (
					<form
						onSubmit={(e) => {
							e.preventDefault();
							setApiKey(key);
							void qc.invalidateQueries({ queryKey: ['auth'] });
						}}
					>
						{status.localAuth && <p className="muted">— or —</p>}
						<Field label="API key" htmlFor="login-key">
							<Input
								id="login-key"
								type="password"
								value={key}
								onChange={(e) => setKey(e.target.value)}
								title="Stored in localStorage; sent as Authorization: Bearer"
							/>
						</Field>
						<Button disabled={!key}>Use API key</Button>
					</form>
				)}
			</Card>
		</main>
	);
}
