import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '@nazuraki/ui-react';
import { useEffect, useState } from 'react';

import { fetchAuthStatus } from './api';
import { SelfUpdate } from './components/SelfUpdate';
import { ContainersPage } from './pages/ContainersPage';
import { BOUNCE_KEY, LoginPage } from './pages/LoginPage';
import { ProjectEditPage } from './pages/ProjectEditPage';
import { ProjectPage } from './pages/ProjectPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { SettingsPage } from './pages/SettingsPage';

/** Tiny hash router: #/projects, #/projects/:name(/edit), #/containers, #/settings. */
function useRoute(): string {
	const [hash, setHash] = useState(window.location.hash);
	useEffect(() => {
		const onChange = (): void => setHash(window.location.hash);
		window.addEventListener('hashchange', onChange);
		return () => window.removeEventListener('hashchange', onChange);
	}, []);
	return hash.replace(/^#/, '') || '/projects';
}

export function App(): React.JSX.Element {
	const route = useRoute();
	const qc = useQueryClient();
	const projectMatch = route.match(/^\/projects\/([^/]+)$/);
	const editMatch = route.match(/^\/projects\/([^/]+)\/edit$/);

	const auth = useQuery({ queryKey: ['auth'], queryFn: fetchAuthStatus });

	// A 401 from any call (e.g. the SSO cookie expired) re-checks auth, which
	// drops into LoginPage and bounces to usr for a fresh cookie.
	useEffect(() => {
		const onUnauthorized = (): void => void qc.invalidateQueries({ queryKey: ['auth'] });
		window.addEventListener('backplane:unauthorized', onUnauthorized);
		return () => window.removeEventListener('backplane:unauthorized', onUnauthorized);
	}, [qc]);
	// Back from usr with a working session: forget the loop guard.
	useEffect(() => {
		if (auth.data?.authenticated) sessionStorage.removeItem(BOUNCE_KEY);
	}, [auth.data?.authenticated]);

	if (auth.isPending) return <main />;
	if (auth.isError) {
		return (
			<main>
				<Alert variant="danger" title="backplane unreachable">
					{auth.error.message}
				</Alert>
			</main>
		);
	}
	if (!auth.data.authenticated) return <LoginPage status={auth.data} />;

	return (
		<div className="layout">
			<aside className="sidebar">
				<span className="brand">backplane</span>
				<a href="#/projects" className={route.startsWith('/projects') ? 'active' : ''}>
					<span className="material-symbols-outlined">account_tree</span>
					Projects
				</a>
				<a href="#/containers" className={route === '/containers' ? 'active' : ''}>
					<span className="material-symbols-outlined">deployed_code</span>
					Containers
				</a>
			</aside>
			<div className="content">
				<header>
					<span className="spacer" />
					<SelfUpdate />
					<a
						href="#/settings"
						className={`icon-btn${route === '/settings' ? ' active' : ''}`}
						title="Settings"
					>
						<span className="material-symbols-outlined">settings</span>
					</a>
					{auth.data.method === 'sso' && auth.data.sso && (
						<a
							href={auth.data.sso.usrUrl}
							className="icon-btn"
							title={`${auth.data.username} — account & sign-out in usr`}
						>
							<span className="material-symbols-outlined">account_circle</span>
						</a>
					)}
				</header>
				<main>
					{editMatch ? (
						<ProjectEditPage name={decodeURIComponent(editMatch[1])} />
					) : projectMatch ? (
						<ProjectPage name={decodeURIComponent(projectMatch[1])} />
					) : route === '/containers' ? (
						<ContainersPage />
					) : route === '/settings' ? (
						<SettingsPage status={auth.data} />
					) : (
						<ProjectsPage />
					)}
				</main>
			</div>
		</div>
	);
}
