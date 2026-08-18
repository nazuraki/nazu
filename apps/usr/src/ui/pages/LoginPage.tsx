import { useMutation, useQueryClient } from '@tanstack/react-query';
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
			<div className="panel login">
				<h1>usr</h1>
				{loginError && <p className="error">{loginError}</p>}
				{status.oauthProviders.length > 0 && (
					<div className="providers">
						{status.oauthProviders.map((p) => (
							<a key={p} href={`/api/auth/oauth/${p}`}>
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
						<div className="row">
							<input
								placeholder="username"
								value={username}
								onChange={(e) => setUsername(e.target.value)}
								autoFocus
							/>
						</div>
						<div className="row">
							<input
								type="password"
								placeholder="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
							/>
						</div>
						<div className="row">
							<button type="submit" disabled={doLogin.isPending || !username || !password}>
								Sign in
							</button>
							{doLogin.isError && <span className="error">{doLogin.error.message}</span>}
						</div>
					</form>
				)}
				{!status.localAuth && status.oauthProviders.length === 0 && (
					<p className="muted">No sign-in method is configured.</p>
				)}
			</div>
		</main>
	);
}
