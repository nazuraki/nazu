import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { clearAccount, getApiKey, saveAccount, setApiKey, type AuthStatus } from '../api';

/**
 * Admin-account management, mirroring nazu web's Settings → auth section:
 * open by default; setting a username/password gates the whole API (login
 * cookie, Basic header, or the env bearer key).
 */
export function SettingsPage({ status }: { status: AuthStatus }): React.JSX.Element {
	const qc = useQueryClient();
	const [username, setUsername] = useState(status.username ?? '');
	const [password, setPassword] = useState('');
	const [confirm, setConfirm] = useState('');
	const [key, setKey] = useState(getApiKey());
	const [saved, setSaved] = useState(false);

	const invalidate = (): void => void qc.invalidateQueries({ queryKey: ['auth'] });

	const save = useMutation({
		mutationFn: () => saveAccount(username.trim(), password),
		onSuccess: () => {
			setPassword('');
			setConfirm('');
			setSaved(true);
			invalidate();
		},
	});

	const disable = useMutation({
		mutationFn: clearAccount,
		onSuccess: invalidate,
	});

	const mismatch = password !== '' && password !== confirm;

	return (
		<>
			<h1>Settings</h1>

			<div className="panel">
				<h2>Local admin account</h2>
				<p className="muted">
					{status.localAuth
						? 'Local auth is enabled — the API requires a login session, Basic credentials, or the API key.'
						: status.apiKeyAuth
							? 'No local account set — the API is gated by the server API key only.'
							: 'No auth configured — the API is open on the network. Set an account to gate it.'}
				</p>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						save.mutate();
					}}
				>
					<div className="row">
						<input
							placeholder="Username"
							value={username}
							onChange={(e) => setUsername(e.target.value)}
						/>
					</div>
					<div className="row">
						<input
							type="password"
							placeholder="New password (min 8 chars)"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
						/>
						<input
							type="password"
							placeholder="Confirm password"
							value={confirm}
							onChange={(e) => setConfirm(e.target.value)}
						/>
					</div>
					{mismatch && <p className="error">Passwords do not match.</p>}
					{save.isError && <p className="error">{(save.error as Error).message}</p>}
					{saved && !save.isError && <p className="muted">Saved. Other sessions were signed out.</p>}
					<div className="row">
						<button disabled={save.isPending || !username.trim() || password.length < 8 || mismatch}>
							{status.localAuth ? 'Change account' : 'Enable local auth'}
						</button>
						{status.localAuth && (
							<button
								type="button"
								className="danger"
								disabled={disable.isPending}
								onClick={() => {
									if (window.confirm('Disable local auth? The API returns to key-only or open mode.')) {
										disable.mutate();
									}
								}}
							>
								Disable local auth
							</button>
						)}
					</div>
				</form>
			</div>

			{status.apiKeyAuth && (
				<div className="panel">
					<h2>API key (this browser)</h2>
					<p className="muted">
						Bearer key for the server&apos;s <code>BACKPLANE_API_KEY</code>; stored in localStorage.
					</p>
					<div className="row">
						<input
							type="password"
							placeholder="API key"
							value={key}
							onChange={(e) => {
								setKey(e.target.value);
								setApiKey(e.target.value);
							}}
						/>
					</div>
				</div>
			)}
		</>
	);
}
