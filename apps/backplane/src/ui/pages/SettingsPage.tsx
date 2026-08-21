import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Field, Input } from '@nazuraki/ui-react';
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

			<Card className="panel">
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
					<Field label="Username" htmlFor="acct-user">
						<Input id="acct-user" value={username} onChange={(e) => setUsername(e.target.value)} />
					</Field>
					<Field label="New password (min 8 chars)" htmlFor="acct-pass">
						<Input
							id="acct-pass"
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
						/>
					</Field>
					<Field label="Confirm password" htmlFor="acct-confirm">
						<Input
							id="acct-confirm"
							type="password"
							value={confirm}
							aria-invalid={mismatch || undefined}
							onChange={(e) => setConfirm(e.target.value)}
						/>
					</Field>
					{mismatch && <Alert variant="danger">Passwords do not match.</Alert>}
					{save.isError && <Alert variant="danger">{(save.error as Error).message}</Alert>}
					{saved && !save.isError && (
						<Alert variant="success">Saved. Other sessions were signed out.</Alert>
					)}
					<div className="row">
						<Button
							variant="primary"
							disabled={save.isPending || !username.trim() || password.length < 8 || mismatch}
						>
							{status.localAuth ? 'Change account' : 'Enable local auth'}
						</Button>
						{status.localAuth && (
							<Button
								type="button"
								variant="danger"
								disabled={disable.isPending}
								onClick={() => {
									if (window.confirm('Disable local auth? The API returns to key-only or open mode.')) {
										disable.mutate();
									}
								}}
							>
								Disable local auth
							</Button>
						)}
					</div>
				</form>
			</Card>

			{status.apiKeyAuth && (
				<Card className="panel">
					<h2>API key (this browser)</h2>
					<p className="muted">
						Bearer key for the server&apos;s <code>BACKPLANE_API_KEY</code>; stored in localStorage.
					</p>
					<Field label="API key" htmlFor="api-key">
						<Input
							id="api-key"
							type="password"
							value={key}
							onChange={(e) => {
								setKey(e.target.value);
								setApiKey(e.target.value);
							}}
						/>
					</Field>
				</Card>
			)}
		</>
	);
}
