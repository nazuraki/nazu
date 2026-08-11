import { useEffect, useState } from 'react';

import { getApiKey, setApiKey } from './api';
import { SelfUpdate } from './components/SelfUpdate';
import { ContainersPage } from './pages/ContainersPage';
import { ProjectPage } from './pages/ProjectPage';
import { ProjectsPage } from './pages/ProjectsPage';

/** Tiny hash router: #/projects, #/projects/:name, #/containers. */
function useRoute(): string {
	const [hash, setHash] = useState(window.location.hash);
	useEffect(() => {
		const onChange = (): void => setHash(window.location.hash);
		window.addEventListener('hashchange', onChange);
		return () => window.removeEventListener('hashchange', onChange);
	}, []);
	return hash.replace(/^#/, '') || '/projects';
}

function KeyInput(): React.JSX.Element {
	const [value, setValue] = useState(getApiKey());
	return (
		<input
			type="password"
			placeholder="API key (if required)"
			value={value}
			onChange={(e) => {
				setValue(e.target.value);
				setApiKey(e.target.value);
			}}
			title="Stored in localStorage; sent as Authorization: Bearer"
		/>
	);
}

export function App(): React.JSX.Element {
	const route = useRoute();
	const projectMatch = route.match(/^\/projects\/([^/]+)$/);

	return (
		<>
			<nav>
				<span className="brand">backplane</span>
				<a href="#/projects">Projects</a>
				<a href="#/containers">Containers</a>
				<span className="spacer" />
				<SelfUpdate />
				<KeyInput />
			</nav>
			<main>
				{projectMatch ? (
					<ProjectPage name={decodeURIComponent(projectMatch[1])} />
				) : route === '/containers' ? (
					<ContainersPage />
				) : (
					<ProjectsPage />
				)}
			</main>
		</>
	);
}
