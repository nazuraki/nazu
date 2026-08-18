import { getSql } from './db.js';
import { NotFoundError, ValidationError } from './users.js';

export interface Role {
	id: number;
	app: string;
	name: string;
	description: string | null;
	permissions: string[];
}

export interface RoleInput {
	app: string;
	name: string;
	description?: string | null;
	permissions: string[];
}

const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
// Permissions also allow ':' for action scoping, e.g. `users:write`.
const PERM_RE = /^[a-z0-9][a-z0-9:._-]{0,63}$/;

interface RoleRow {
	id: string;
	app: string;
	name: string;
	description: string | null;
	permissions: string[] | null;
}

const ROLE_QUERY = `
	SELECT r.id, r.app, r.name, r.description,
	       array_remove(array_agg(rp.permission ORDER BY rp.permission), NULL) AS permissions
	FROM roles r
	LEFT JOIN role_permissions rp ON rp.role_id = r.id
`;

function toRole(row: RoleRow): Role {
	return {
		id: Number(row.id),
		app: row.app,
		name: row.name,
		description: row.description,
		permissions: row.permissions ?? [],
	};
}

function validate(input: RoleInput): void {
	if (!NAME_RE.test(input.app)) throw new ValidationError(`invalid app "${input.app}"`);
	if (!NAME_RE.test(input.name)) throw new ValidationError(`invalid role name "${input.name}"`);
	if (!Array.isArray(input.permissions)) throw new ValidationError('permissions must be an array');
	for (const p of input.permissions) {
		if (!PERM_RE.test(p)) throw new ValidationError(`invalid permission "${p}"`);
	}
}

export async function listRoles(app?: string): Promise<Role[]> {
	const sql = getSql();
	const rows = (await (app
		? sql.unsafe(`${ROLE_QUERY} WHERE r.app = $1 GROUP BY r.id ORDER BY r.app, r.name`, [app])
		: sql.unsafe(`${ROLE_QUERY} GROUP BY r.id ORDER BY r.app, r.name`))) as unknown as RoleRow[];
	return rows.map(toRole);
}

export async function getRole(id: number): Promise<Role | undefined> {
	const sql = getSql();
	const rows = (await sql.unsafe(`${ROLE_QUERY} WHERE r.id = $1 GROUP BY r.id`, [
		id,
	])) as unknown as RoleRow[];
	return rows[0] ? toRole(rows[0]) : undefined;
}

export async function createRole(input: RoleInput): Promise<Role> {
	validate(input);
	const sql = getSql();
	const id = await sql.begin(async (tx) => {
		const rows = await tx<{ id: string }[]>`
			INSERT INTO roles (app, name, description)
			VALUES (${input.app}, ${input.name}, ${input.description ?? null})
			ON CONFLICT (app, name) DO NOTHING
			RETURNING id
		`;
		if (!rows[0]) throw new ValidationError(`role ${input.app}/${input.name} already exists`);
		const roleId = Number(rows[0].id);
		for (const p of input.permissions) {
			await tx`INSERT INTO role_permissions (role_id, permission) VALUES (${roleId}, ${p})`;
		}
		return roleId;
	});
	return (await getRole(id))!;
}

/** Replace name/description/permissions of an existing role. */
export async function updateRole(id: number, input: RoleInput): Promise<Role> {
	validate(input);
	const sql = getSql();
	await sql.begin(async (tx) => {
		const rows = await tx<{ id: string }[]>`
			UPDATE roles SET app = ${input.app}, name = ${input.name},
			                 description = ${input.description ?? null}
			WHERE id = ${id} RETURNING id
		`;
		if (!rows[0]) throw new NotFoundError(`role ${id} not found`);
		await tx`DELETE FROM role_permissions WHERE role_id = ${id}`;
		for (const p of input.permissions) {
			await tx`INSERT INTO role_permissions (role_id, permission) VALUES (${id}, ${p})`;
		}
	});
	return (await getRole(id))!;
}

export async function deleteRole(id: number): Promise<boolean> {
	const sql = getSql();
	const res = await sql`DELETE FROM roles WHERE id = ${id}`;
	return res.count > 0;
}

// ── Assignments ──────────────────────────────────────────────────────────────

export async function listUserRoles(userId: number): Promise<Role[]> {
	const sql = getSql();
	const rows = (await sql.unsafe(
		`${ROLE_QUERY} JOIN user_roles ur ON ur.role_id = r.id AND ur.user_id = $1
		 GROUP BY r.id ORDER BY r.app, r.name`,
		[userId],
	)) as unknown as RoleRow[];
	return rows.map(toRole);
}

/** Replace a user's role set with the given role ids. */
export async function setUserRoles(userId: number, roleIds: number[]): Promise<void> {
	const sql = getSql();
	await sql.begin(async (tx) => {
		await tx`DELETE FROM user_roles WHERE user_id = ${userId}`;
		for (const roleId of roleIds) {
			await tx`INSERT INTO user_roles (user_id, role_id) VALUES (${userId}, ${roleId})`;
		}
	});
}
