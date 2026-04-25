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
];
