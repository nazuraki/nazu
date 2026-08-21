import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Field, Input } from '@nazuraki/ui-react';
import { useState } from 'react';

import { login, type AuthStatus } from '../api';

const LOGIN_ERRORS: Record<string, string> = {
	state: 'Sign-in expired or was tampered with — try again.',
	unknown_user: 'This account is not provisioned. Ask an admin to add your email.',
	oauth: 'Sign-in with the provider failed.',
};

export function LoginPage({ status }: { status: AuthStatus }): React.JSX.Element {
	const qc = useQueryClient();
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const loginError = LOGIN_ERRORS[new URLSearchParams(window.location.search).get('login_error') ?? ''];

	const doLogin = useMutation({
		mutationFn: () => login(username, password),
		onSuccess: () => void qc.invalidateQueries({ queryKey: ['auth'] }),
	});

	return (
		<main>
			<Card className="panel login">
				<h1>usr</h1>
				{loginError && <Alert variant="danger">{loginError}</Alert>}
				{status.oauthProviders.length > 0 && (
					<div className="providers">
						{status.oauthProviders.map((p) => (
							<a key={p} className="nb-btn nb-btn--primary" href={`/api/auth/oauth/${p}`}>
								Sign in with {p}
							</a>
						))}
					</div>
				)}
				{status.localAuth && (
					<form
						onSubmit={(e) => {
							e.preventDefault();
							doLogin.mutate();
						}}
					>
						{status.oauthProviders.length > 0 && <p className="muted">— or —</p>}
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
						{doLogin.isError && <Alert variant="danger">{doLogin.error.message}</Alert>}
						<Button variant="primary" disabled={doLogin.isPending || !username || !password}>
							Sign in
						</Button>
					</form>
				)}
				{!status.localAuth && status.oauthProviders.length === 0 && (
					<p className="muted">No sign-in method is configured.</p>
				)}
			</Card>
		</main>
	);
}
