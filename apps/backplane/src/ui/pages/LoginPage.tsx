import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Field, Input } from '@nazuraki/ui-react';
import { useEffect, useState } from 'react';

import { getApiKey, setApiKey, type AuthStatus } from '../api';

/** Set while bouncing to usr so a fruitless round trip doesn't loop forever. */
export const BOUNCE_KEY = 'backplane_sso_bounce';

/**
 * Shown instead of the app whenever the API is gated and this browser doesn't
 * authenticate. With usr SSO configured: no identity → bounce to usr's refresh
 * endpoint (which re-mints `nz_id` or shows usr's login and returns here);
 * identity without a backplane grant → explain, don't loop. The API-key form
 * remains for the bearer-key path.
 */
export function LoginPage({ status }: { status: AuthStatus }): React.JSX.Element {
	const qc = useQueryClient();
	const [key, setKey] = useState(getApiKey());
	const { sso, identity } = status;
	const bounced = sessionStorage.getItem(BOUNCE_KEY) !== null;
	const autoBounce = Boolean(sso?.refreshUrl) && !identity && !bounced;

	const goToUsr = (): void => {
		if (!sso?.refreshUrl) return;
		sessionStorage.setItem(BOUNCE_KEY, '1');
		window.location.assign(sso.refreshUrl);
	};

	useEffect(() => {
		if (autoBounce) goToUsr();
	}, [autoBounce]);

	if (autoBounce) return <main />;

	return (
		<main>
			<Card className="panel login">
				<h1>backplane</h1>
				{sso && identity && (
					<>
						<p>
							Signed in as <strong>{identity.email}</strong>, but this account has no{' '}
							<code>{sso.app}</code> role in usr.
						</p>
						<p className="muted">Ask an admin to grant one, then reload.</p>
						<Button
							type="button"
							variant="primary"
							onClick={() => {
								sessionStorage.removeItem(BOUNCE_KEY);
								window.location.reload();
							}}
						>
							Reload
						</Button>
					</>
				)}
				{sso && !identity && (
					<>
						<p className="muted">Sign in through usr to continue.</p>
						{bounced && (
							<Alert variant="warning">
								usr sent you back without an identity cookie — check that it is reachable and
								that SSO is enabled for this domain.
							</Alert>
						)}
						<Button type="button" variant="primary" onClick={goToUsr} disabled={!sso.refreshUrl}>
							Sign in with usr
						</Button>
					</>
				)}
				{status.apiKeyAuth && (
					<form
						onSubmit={(e) => {
							e.preventDefault();
							setApiKey(key);
							void qc.invalidateQueries({ queryKey: ['auth'] });
						}}
					>
						{sso && <p className="muted">— or —</p>}
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
