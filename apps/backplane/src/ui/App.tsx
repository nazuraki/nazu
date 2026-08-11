import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { fetchAuthStatus, logout } from './api';
import { SelfUpdate } from './components/SelfUpdate';
import { ContainersPage } from './pages/ContainersPage';
import { LoginPage } from './pages/LoginPage';
import { ProjectPage } from './pages/ProjectPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { SettingsPage } from './pages/SettingsPage';

/** Tiny hash router: #/projects, #/projects/:name, #/containers, #/settings. */
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

	const auth = useQuery({ queryKey: ['auth'], queryFn: fetchAuthStatus });
	const doLogout = useMutation({
		mutationFn: logout,
		onSuccess: () => void qc.invalidateQueries(),
	});

	if (auth.isPending) return <main />;
	if (auth.isError) return <main className="error">backplane unreachable: {auth.error.message}</main>;
	if (!auth.data.authenticated) return <LoginPage status={auth.data} />;

	return (
		<>
			<nav>
				<span className="brand">backplane</span>
				<a href="#/projects">Projects</a>
				<a href="#/containers">Containers</a>
				<a href="#/settings">Settings</a>
				<span className="spacer" />
				<SelfUpdate />
				{auth.data.method === 'session' && (
					<button onClick={() => doLogout.mutate()} disabled={doLogout.isPending}>
						Sign out
					</button>
				)}
			</nav>
			<main>
				{projectMatch ? (
					<ProjectPage name={decodeURIComponent(projectMatch[1])} />
				) : route === '/containers' ? (
					<ContainersPage />
				) : route === '/settings' ? (
					<SettingsPage status={auth.data} />
				) : (
					<ProjectsPage />
				)}
			</main>
		</>
	);
}
