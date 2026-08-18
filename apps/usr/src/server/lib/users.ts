import { getSql } from './db.js';

export interface User {
	id: number;
	email: string;
	name: string | null;
	displayName: string | null;
	avatarUrl: string | null;
	timezone: string | null;
	createdAt: string;
	updatedAt: string;
	lastLoginAt: string | null;
}

export interface ProfileInput {
	name?: string | null;
	displayName?: string | null;
	avatarUrl?: string | null;
	timezone?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class ValidationError extends Error {}
export class NotFoundError extends Error {}

interface UserRow {
	id: string;
	email: string;
	name: string | null;
	display_name: string | null;
	avatar_url: string | null;
	timezone: string | null;
	created_at: string;
	updated_at: string;
	last_login_at: string | null;
}

function toUser(row: UserRow): User {
	return {
		id: Number(row.id),
		email: row.email,
		name: row.name,
		displayName: row.display_name,
		avatarUrl: row.avatar_url,
		timezone: row.timezone,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		lastLoginAt: row.last_login_at,
	};
}

export async function listUsers(): Promise<User[]> {
	const sql = getSql();
	const rows = await sql<UserRow[]>`SELECT * FROM users ORDER BY email`;
	return rows.map(toUser);
}

export async function getUser(id: number): Promise<User | undefined> {
	const sql = getSql();
	const rows = await sql<UserRow[]>`SELECT * FROM users WHERE id = ${id}`;
	return rows[0] ? toUser(rows[0]) : undefined;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
	const sql = getSql();
	const rows = await sql<UserRow[]>`SELECT * FROM users WHERE email = ${email.toLowerCase()}`;
	return rows[0] ? toUser(rows[0]) : undefined;
}

/** Create a user by email (admin pre-provisioning or first OAuth login). */
export async function createUser(email: string, profile: ProfileInput = {}): Promise<User> {
	const normalized = email.trim().toLowerCase();
	if (!EMAIL_RE.test(normalized)) throw new ValidationError(`invalid email "${email}"`);
	const sql = getSql();
	const rows = await sql<UserRow[]>`
		INSERT INTO users (email, name, display_name, avatar_url, timezone)
		VALUES (${normalized}, ${profile.name ?? null}, ${profile.displayName ?? null},
		        ${profile.avatarUrl ?? null}, ${profile.timezone ?? null})
		ON CONFLICT (email) DO NOTHING
		RETURNING *
	`;
	if (!rows[0]) throw new ValidationError(`user "${normalized}" already exists`);
	return toUser(rows[0]);
}

export async function updateProfile(id: number, profile: ProfileInput): Promise<User> {
	const sql = getSql();
	const rows = await sql<UserRow[]>`
		UPDATE users SET
			name = COALESCE(${profile.name ?? null}, name),
			display_name = COALESCE(${profile.displayName ?? null}, display_name),
			avatar_url = COALESCE(${profile.avatarUrl ?? null}, avatar_url),
			timezone = COALESCE(${profile.timezone ?? null}, timezone),
			updated_at = now()
		WHERE id = ${id}
		RETURNING *
	`;
	if (!rows[0]) throw new NotFoundError(`user ${id} not found`);
	return toUser(rows[0]);
}

export async function deleteUser(id: number): Promise<boolean> {
	const sql = getSql();
	const res = await sql`DELETE FROM users WHERE id = ${id}`;
	return res.count > 0;
}

export async function touchLastLogin(id: number): Promise<void> {
	const sql = getSql();
	await sql`UPDATE users SET last_login_at = now() WHERE id = ${id}`;
}
