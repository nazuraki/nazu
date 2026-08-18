import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { fetchAuthStatus, logout } from './api';
import { LoginPage } from './pages/LoginPage';
import { ProfilePage } from './pages/ProfilePage';
import { SetupPage } from './pages/SetupPage';
import { RolesPage } from './pages/RolesPage';
import { SettingsPage } from './pages/SettingsPage';
import { UserEditPage } from './pages/UserEditPage';
import { UsersPage } from './pages/UsersPage';

/** Tiny hash router: #/profile, #/users, #/users/:id, #/roles, #/settings. */
function useRoute(): string {
	const [hash, setHash] = useState(window.location.hash);
	useEffect(() => {
		const onChange = (): void => setHash(window.location.hash);
		window.addEventListener('hashchange', onChange);
		return () => window.removeEventListener('hashchange', onChange);
	}, []);
	return hash.replace(/^#/, '') || '/profile';
}

export function App(): React.JSX.Element {
	const route = useRoute();
	const qc = useQueryClient();
	const userMatch = route.match(/^\/users\/(\d+)$/);

	const auth = useQuery({ queryKey: ['auth'], queryFn: fetchAuthStatus });
	const doLogout = useMutation({
		mutationFn: logout,
		onSuccess: () => void qc.invalidateQueries(),
	});

	if (auth.isPending) return <main />;
	if (auth.isError) return <main className="error">usr unreachable: {auth.error.message}</main>;
	if (auth.data.setupRequired) return <SetupPage />;
	if (!auth.data.authenticated) return <LoginPage status={auth.data} />;

	const admin = auth.data.admin;
	// Identities without a users row (local admin, api key, open mode) have no profile.
	const hasProfile = auth.data.method === 'session' && auth.data.email !== null;

	return (
		<div className="layout">
			<aside className="sidebar">
				<span className="brand">usr</span>
				{hasProfile && (
					<a href="#/profile" className={route === '/profile' ? 'active' : ''}>
						<span className="material-symbols-outlined">person</span>
						Profile
					</a>
				)}
				{admin && (
					<a href="#/users" className={route.startsWith('/users') ? 'active' : ''}>
						<span className="material-symbols-outlined">group</span>
						Users
					</a>
				)}
				{admin && (
					<a href="#/roles" className={route === '/roles' ? 'active' : ''}>
						<span className="material-symbols-outlined">shield_person</span>
						Roles
					</a>
				)}
			</aside>
			<div className="content">
				<header>
					<span className="spacer" />
					{auth.data.email && <span className="muted">{auth.data.email}</span>}
					{admin && (
						<a
							href="#/settings"
							className={`icon-btn${route === '/settings' ? ' active' : ''}`}
							title="Settings"
						>
							<span className="material-symbols-outlined">settings</span>
						</a>
					)}
					{auth.data.method === 'session' && (
						<button
							className="icon-btn"
							title="Sign out"
							onClick={() => doLogout.mutate()}
							disabled={doLogout.isPending}
						>
							<span className="material-symbols-outlined">logout</span>
						</button>
					)}
				</header>
				<main>
					{userMatch && admin ? (
						<UserEditPage id={Number(userMatch[1])} />
					) : route.startsWith('/users') && admin ? (
						<UsersPage />
					) : route === '/roles' && admin ? (
						<RolesPage />
					) : route === '/settings' && admin ? (
						<SettingsPage />
					) : hasProfile ? (
						<ProfilePage />
					) : admin ? (
						<UsersPage />
					) : (
						<p className="muted">Signed in as {auth.data.method}.</p>
					)}
				</main>
			</div>
		</div>
	);
}
