import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { fetchOAuthSettings, saveLocalAdmin, saveOAuthSettings } from '../api';

export function SettingsPage(): React.JSX.Element {
	const qc = useQueryClient();
	const oauth = useQuery({ queryKey: ['settings', 'oauth'], queryFn: fetchOAuthSettings });

	const [githubId, setGithubId] = useState<string | null>(null);
	const [githubSecret, setGithubSecret] = useState('');
	const [googleId, setGoogleId] = useState<string | null>(null);
	const [googleSecret, setGoogleSecret] = useState('');

	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');

	const saveOAuth = useMutation({
		mutationFn: () => {
			const values: Record<string, string> = {};
			if (githubId !== null) values.githubId = githubId;
			if (githubSecret) values.githubSecret = githubSecret;
			if (googleId !== null) values.googleId = googleId;
			if (googleSecret) values.googleSecret = googleSecret;
			return saveOAuthSettings(values);
		},
		onSuccess: () => {
			setGithubSecret('');
			setGoogleSecret('');
			void qc.invalidateQueries({ queryKey: ['settings'] });
			void qc.invalidateQueries({ queryKey: ['auth'] });
		},
	});

	const saveAdmin = useMutation({
		mutationFn: () => saveLocalAdmin(username, password),
		onSuccess: () => {
			setUsername('');
			setPassword('');
			void qc.invalidateQueries({ queryKey: ['auth'] });
		},
	});

	if (oauth.isPending) return <p className="muted">loading…</p>;
	if (oauth.isError) return <p className="error">{oauth.error.message}</p>;

	return (
		<>
			<h1>Settings</h1>
			<h2>OAuth providers</h2>
			<div className="panel">
				<p className="muted">
					Callback URLs: <code>/api/auth/oauth/github/callback</code> ·{' '}
					<code>/api/auth/oauth/google/callback</code>. Secrets are write-only.
				</p>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						saveOAuth.mutate();
					}}
				>
					<label>GitHub client id</label>
					<input
						value={githubId ?? oauth.data.githubId}
						onChange={(e) => setGithubId(e.target.value)}
					/>
					<label>GitHub client secret {oauth.data.githubSecretSet && '(set)'}</label>
					<input
						type="password"
						value={githubSecret}
						placeholder={oauth.data.githubSecretSet ? '••••••••' : ''}
						onChange={(e) => setGithubSecret(e.target.value)}
					/>
					<label>Google client id</label>
					<input
						value={googleId ?? oauth.data.googleId}
						onChange={(e) => setGoogleId(e.target.value)}
					/>
					<label>Google client secret {oauth.data.googleSecretSet && '(set)'}</label>
					<input
						type="password"
						value={googleSecret}
						placeholder={oauth.data.googleSecretSet ? '••••••••' : ''}
						onChange={(e) => setGoogleSecret(e.target.value)}
					/>
					<div className="row" style={{ marginTop: '0.75rem' }}>
						<button type="submit" disabled={saveOAuth.isPending}>
							Save OAuth
						</button>
						{saveOAuth.isError && <span className="error">{saveOAuth.error.message}</span>}
					</div>
				</form>
			</div>
			<h2>Local admin</h2>
			<div className="panel">
				<p className="muted">
					Fallback credentials with full admin rights — useful before OAuth is configured.
				</p>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						saveAdmin.mutate();
					}}
				>
					<label>Username</label>
					<input value={username} onChange={(e) => setUsername(e.target.value)} />
					<label>Password</label>
					<input
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
					/>
					<div className="row" style={{ marginTop: '0.75rem' }}>
						<button type="submit" disabled={saveAdmin.isPending || !username || !password}>
							Save admin account
						</button>
						{saveAdmin.isError && <span className="error">{saveAdmin.error.message}</span>}
					</div>
				</form>
			</div>
		</>
	);
}
