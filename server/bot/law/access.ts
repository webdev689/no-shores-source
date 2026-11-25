// Who may do what in the bot's panel. A member's level comes from their own Discord permissions in the server, so
// the panel never grants more than Discord already does, plus any roles the owners granted panel access to.

/** Discord's permission bits the panel reads. Permissions are 64-bit, so they are BigInts. */
export const PERMISSION = Object.freeze({
  KICK_MEMBERS: 1n << 1n,
  BAN_MEMBERS: 1n << 2n,
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_GUILD: 1n << 5n,
  ADD_REACTIONS: 1n << 6n,
  VIEW_AUDIT_LOG: 1n << 7n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  MANAGE_MESSAGES: 1n << 13n,
  EMBED_LINKS: 1n << 14n,
  ATTACH_FILES: 1n << 15n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  MENTION_EVERYONE: 1n << 17n,
  CONNECT: 1n << 20n,
  MUTE_MEMBERS: 1n << 22n,
  MOVE_MEMBERS: 1n << 24n,
  MANAGE_NICKNAMES: 1n << 27n,
  MANAGE_ROLES: 1n << 28n,
  MANAGE_WEBHOOKS: 1n << 29n,
  MANAGE_GUILD_EXPRESSIONS: 1n << 30n,
  MANAGE_THREADS: 1n << 34n,
  CREATE_PUBLIC_THREADS: 1n << 35n,
  SEND_MESSAGES_IN_THREADS: 1n << 38n,
  MODERATE_MEMBERS: 1n << 40n,
  ALL: (1n << 53n) - 1n,
});
export type PermissionName = keyof typeof PERMISSION;

/** The panel's levels, lowest first. Each includes every level below it. */
export const LEVELS = Object.freeze(['none', 'viewer', 'moderator', 'manager', 'owner'] as const);
export type Level = (typeof LEVELS)[number];

export const isLevel = (value: unknown): value is Level => LEVELS.includes(value as Level);
export const atLeast = (have: Level, need: Level): boolean => LEVELS.indexOf(have) >= LEVELS.indexOf(need);

/** A server's roles as the access law reads them. */
export interface RoleOfServer {
  readonly id: string;
  readonly permissions: string;
  readonly position?: number;
  readonly managed?: boolean;
  readonly mentionable?: boolean;
}
export interface ServerOfAccess {
  readonly id: string;
  readonly owner_id: string;
  readonly roles: readonly RoleOfServer[];
}
export interface MemberOfAccess {
  readonly user_id: string;
  readonly roles: readonly string[];
}

const bitsOf = (value: unknown): bigint => {
  try {
    return typeof value === 'string' || typeof value === 'number' ? BigInt(value) : 0n;
  } catch {
    return 0n;
  }
};

/**
 * A member's permissions in the server, as Discord computes them before channel overwrites: the @everyone role's
 * (whose id is the server's) and each of the member's roles', and everything for an administrator or the owner.
 */
export function basePermissions(server: ServerOfAccess, member: MemberOfAccess): bigint {
  if (member.user_id === server.owner_id) return PERMISSION.ALL;
  const byId = new Map(server.roles.map((role) => [role.id, bitsOf(role.permissions)]));
  let held = byId.get(server.id) ?? 0n;
  for (const id of member.roles) held |= byId.get(id) ?? 0n;
  return (held & PERMISSION.ADMINISTRATOR) !== 0n ? PERMISSION.ALL : held;
}

const MODERATOR_BITS =
  PERMISSION.KICK_MEMBERS | PERMISSION.BAN_MEMBERS | PERMISSION.MODERATE_MEMBERS | PERMISSION.MANAGE_MESSAGES;

/** A role the panel's settings let in at a level. */
export interface Grant {
  readonly role: string;
  readonly level: string;
}

/**
 * A member's panel level. `owners` are the user ids the deploy names as the bot's owners; `grants` the panel's role
 * grants, which raise a member to manager at most: owner stays the server owner's and the deploy's to give.
 */
export function levelOf(
  server: ServerOfAccess,
  member: MemberOfAccess,
  extra: { readonly owners?: readonly string[]; readonly grants?: readonly Grant[] } = {},
): Level {
  if (member.user_id === server.owner_id || (extra.owners ?? []).includes(member.user_id)) return 'owner';
  const held = basePermissions(server, member);
  let level: Level = 'none';
  if ((held & (PERMISSION.ADMINISTRATOR | PERMISSION.MANAGE_GUILD)) !== 0n) level = 'manager';
  else if ((held & MODERATOR_BITS) !== 0n) level = 'moderator';
  else if ((held & PERMISSION.VIEW_AUDIT_LOG) !== 0n) level = 'viewer';
  for (const grant of extra.grants ?? []) {
    if (!member.roles.includes(grant.role) || grant.level === 'owner' || !isLevel(grant.level)) continue;
    if (!atLeast(level, grant.level)) level = grant.level;
  }
  return level;
}

export const hasAll = (have: bigint, need: bigint): boolean => (have & need) === need;

/** Why a role may not be named in a module's settings, in the person's words. */
export const ROLE_REFUSALS = Object.freeze({
  missing: 'A role named here is not in the server.',
  managed: 'A role named here belongs to Discord or an app, so no one can be given it.',
  everyone: 'The everyone role cannot be named here.',
  permission: 'You need Manage Roles to name a role here.',
  above: 'You can name only roles below your highest role.',
  mention: 'You need Mention Everyone to mention a role here that does not let anyone mention it.',
});
export type RoleRefusal = { readonly role: string; readonly why: keyof typeof ROLE_REFUSALS };

/**
 * Discord's own rule for giving a role, held for every role a setting makes the bot give: the role is the server's
 * own and can be given, the person holds Manage Roles, and it sits below their highest role. The server's owner, and
 * the bot's owners (`owner`), are held only to the first. Answers the first role refused and why, or null.
 */
export function roleRefusal(
  server: ServerOfAccess,
  member: MemberOfAccess,
  roleIds: readonly string[],
  { owner = false }: { readonly owner?: boolean } = {},
): RoleRefusal | null {
  const byId = new Map(server.roles.map((role) => [role.id, role]));
  for (const id of roleIds) {
    const role = byId.get(id);
    if (!role) return { role: id, why: 'missing' };
    if (role.managed || id === server.id) return { role: id, why: 'managed' };
  }
  const first = roleIds[0];
  if (owner || member.user_id === server.owner_id || first === undefined) return null;
  if (!hasAll(basePermissions(server, member), PERMISSION.MANAGE_ROLES)) return { role: first, why: 'permission' };
  const top = Math.max(0, ...member.roles.map((id) => byId.get(id)?.position ?? 0));
  const above = roleIds.find((id) => (byId.get(id)?.position ?? 0) >= top);
  return above ? { role: above, why: 'above' } : null;
}

/**
 * The rule for a role a setting only names, to match, exempt or let in the members who hold it: it is one of the
 * server's own. The everyone role is not, here: no member's roles list it, and a ticket opened to it is open to all.
 */
export function roleNameRefusal(server: ServerOfAccess, roleIds: readonly string[]): RoleRefusal | null {
  const own = new Set(server.roles.map((role) => role.id));
  for (const id of roleIds) {
    if (id === server.id) return { role: id, why: 'everyone' };
    if (!own.has(id)) return { role: id, why: 'missing' };
  }
  return null;
}

/**
 * Discord's rule for opening a channel to a role, held for every role a setting makes the bot open its channels to:
 * the role is one a setting may name, and the person holds Manage Roles, which Discord asks for to change who sees a
 * channel. The server's owner, and the bot's owners (`owner`), are held only to the first.
 */
export function openRefusal(
  server: ServerOfAccess,
  member: MemberOfAccess,
  roleIds: readonly string[],
  { owner = false }: { readonly owner?: boolean } = {},
): RoleRefusal | null {
  const named = roleNameRefusal(server, roleIds);
  const first = roleIds[0];
  if (named || owner || first === undefined || hasAll(basePermissions(server, member), PERMISSION.MANAGE_ROLES))
    return named;
  return { role: first, why: 'permission' };
}

/**
 * Discord's rule for mentioning a role, held for every role a setting makes the bot mention: the role is one a setting
 * may name, and it lets anyone mention it or the person holds Mention Everyone. The server's owner, and the bot's
 * owners (`owner`), are held only to the first.
 */
export function mentionRefusal(
  server: ServerOfAccess,
  member: MemberOfAccess,
  roleIds: readonly string[],
  { owner = false }: { readonly owner?: boolean } = {},
): RoleRefusal | null {
  const named = roleNameRefusal(server, roleIds);
  if (named || owner || hasAll(basePermissions(server, member), PERMISSION.MENTION_EVERYONE)) return named;
  const open = new Set(server.roles.filter((role) => role.mentionable).map((role) => role.id));
  const closed = roleIds.find((id) => !open.has(id));
  return closed ? { role: closed, why: 'mention' } : null;
}

/** The names of the bits in `need` that `have` lacks, for a setup check's words. */
export function missing(have: bigint, need: bigint): string[] {
  return Object.entries(PERMISSION)
    .filter(([name, bit]) => name !== 'ALL' && (need & bit) !== 0n && (have & bit) === 0n)
    .map(([name]) => name);
}
