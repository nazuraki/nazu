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
		name: 'Librarian',
		href: '/librarian',
		description: 'Search and browse the library',
	},
	{
		name: 'Nazu',
		href: '/nazu',
		description: 'Second brain — knowledge graph and tasks',
	},
];
