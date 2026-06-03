export interface Service {
	name: string;
	href: string;
	description: string;
}

export const services: Service[] = [
	{
		name: 'Dashboard',
		href: '/dashboard',
		description: 'System metrics and monitoring',
	},
	{
		name: 'Search',
		href: '/search',
		description: 'Search and browse the library',
	},
	{
		name: 'Tasks',
		href: '/tasks',
		description: 'Edit the task list',
	},
	{
		name: 'Ingest',
		href: '/ingest',
		description: 'Add a document to the knowledge base',
	},
	{
		name: 'Settings',
		href: '/settings',
		description: 'Toggle optional services',
	},
];
