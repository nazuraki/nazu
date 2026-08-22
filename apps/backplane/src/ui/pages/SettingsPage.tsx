import { Card, Field, Input } from '@nazuraki/ui-react';
import { useState } from 'react';

import { getApiKey, setApiKey, type AuthStatus } from '../api';

/**
 * Auth overview: who this browser is (per usr SSO), how the API is gated, and
 * the optional bearer key for this browser. Accounts and roles are managed in
 * usr — the backplane holds none of its own.
 */
export function SettingsPage({ status }: { status: AuthStatus }): React.JSX.Element {
	const [key, setKey] = useState(getApiKey());
	const { sso, identity } = status;

	return (
		<>
			<h1>Settings</h1>

			<Card className="panel">
				<h2>Sign-in</h2>
				{sso ? (
					<>
						<p className="muted">
							Browsers authenticate with the usr SSO cookie; access requires a{' '}
							<code>{sso.app}</code> role in usr.
						</p>
						{identity ? (
							<p>
								Signed in as <strong>{identity.email}</strong>
								{identity.roles.length > 0 && <> — roles: {identity.roles.join(', ')}</>}
							</p>
						) : (
							<p className="muted">This request authenticated by {status.method}, not SSO.</p>
						)}
						<p>
							<a href={sso.usrUrl}>Open usr</a> to manage users, roles, or sign out.
						</p>
					</>
				) : (
					<p className="muted">
						{status.apiKeyAuth
							? 'usr SSO is not configured — the API is gated by the server API key only.'
							: 'No auth configured — the API is open on the network. Set BACKPLANE_USR_URL and/or BACKPLANE_API_KEY to gate it.'}
					</p>
				)}
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
