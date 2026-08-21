import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Field, Input, Spinner } from '@nazuraki/ui-react';
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
	const [adminEmail, setAdminEmail] = useState('');

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
		mutationFn: () => saveLocalAdmin(username, password, adminEmail || undefined),
		onSuccess: () => {
			setUsername('');
			setPassword('');
			setAdminEmail('');
			void qc.invalidateQueries({ queryKey: ['auth'] });
		},
	});

	if (oauth.isPending) return <Spinner />;
	if (oauth.isError) return <Alert variant="danger">{oauth.error.message}</Alert>;

	return (
		<>
			<h1>Settings</h1>
			<h2>OAuth providers</h2>
			<Card className="panel">
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
					<Field label="GitHub client id" htmlFor="gh-id">
						<Input
							id="gh-id"
							value={githubId ?? oauth.data.githubId}
							onChange={(e) => setGithubId(e.target.value)}
						/>
					</Field>
					<Field
						label={<>GitHub client secret {oauth.data.githubSecretSet && '(set)'}</>}
						htmlFor="gh-secret"
					>
						<Input
							id="gh-secret"
							type="password"
							value={githubSecret}
							placeholder={oauth.data.githubSecretSet ? '••••••••' : ''}
							onChange={(e) => setGithubSecret(e.target.value)}
						/>
					</Field>
					<Field label="Google client id" htmlFor="gg-id">
						<Input
							id="gg-id"
							value={googleId ?? oauth.data.googleId}
							onChange={(e) => setGoogleId(e.target.value)}
						/>
					</Field>
					<Field
						label={<>Google client secret {oauth.data.googleSecretSet && '(set)'}</>}
						htmlFor="gg-secret"
					>
						<Input
							id="gg-secret"
							type="password"
							value={googleSecret}
							placeholder={oauth.data.googleSecretSet ? '••••••••' : ''}
							onChange={(e) => setGoogleSecret(e.target.value)}
						/>
					</Field>
					{saveOAuth.isError && <Alert variant="danger">{saveOAuth.error.message}</Alert>}
					<Button variant="primary" disabled={saveOAuth.isPending}>
						Save OAuth
					</Button>
				</form>
			</Card>
			<h2>Local admin</h2>
			<Card className="panel">
				<p className="muted">
					Break-glass credentials with full admin rights, linked to an existing user. Leave the
					email empty to keep the current linkage.
				</p>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						saveAdmin.mutate();
					}}
				>
					<Field label="Username" htmlFor="adm-user">
						<Input id="adm-user" value={username} onChange={(e) => setUsername(e.target.value)} />
					</Field>
					<Field label="Password" htmlFor="adm-pass">
						<Input
							id="adm-pass"
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
						/>
					</Field>
					<Field label="Linked user email (optional)" htmlFor="adm-email">
						<Input id="adm-email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
					</Field>
					{saveAdmin.isError && <Alert variant="danger">{saveAdmin.error.message}</Alert>}
					<Button variant="primary" disabled={saveAdmin.isPending || !username || !password}>
						Save admin account
					</Button>
				</form>
			</Card>
		</>
	);
}
