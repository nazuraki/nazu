import { useMutation, useQueryClient } from '@tanstack/react-query';
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
			<div className="panel login">
				<h1>backplane</h1>
				{status.localAuth && (
					<form
						onSubmit={(e) => {
							e.preventDefault();
							doLogin.mutate();
						}}
					>
						<div className="row">
							<input
								placeholder="Username"
								value={username}
								autoFocus
								onChange={(e) => setUsername(e.target.value)}
							/>
						</div>
						<div className="row">
							<input
								type="password"
								placeholder="Password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
							/>
						</div>
						{doLogin.isError && <p className="error">{(doLogin.error as Error).message}</p>}
						<button disabled={doLogin.isPending || !username || !password}>Sign in</button>
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
						<div className="row">
							<input
								type="password"
								placeholder="API key"
								value={key}
								onChange={(e) => setKey(e.target.value)}
								title="Stored in localStorage; sent as Authorization: Bearer"
							/>
						</div>
						<button disabled={!key}>Use API key</button>
					</form>
				)}
			</div>
		</main>
	);
}
