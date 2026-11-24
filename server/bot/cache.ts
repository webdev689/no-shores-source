// The Gateway object's own memory of what Discord does not resend: a message's words before it was edited or
// deleted, a member's nickname and roles before they changed, where each member sits in voice, and each invite's
// use count. It lives in the Durable Object's SQLite, beside the socket that feeds it, so a busy server costs no
// database writes. Messages are kept a set number of days and then swept.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS msg (id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL,
     author_id TEXT NOT NULL, author TEXT NOT NULL, content TEXT NOT NULL, files TEXT NOT NULL, at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS msg_at ON msg (at)',
  `CREATE TABLE IF NOT EXISTS member (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, nick TEXT NOT NULL,
     roles TEXT NOT NULL, PRIMARY KEY (guild_id, user_id))`,
  `CREATE TABLE IF NOT EXISTS voice (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, channel_id TEXT NOT NULL,
     since INTEGER NOT NULL, PRIMARY KEY (guild_id, user_id))`,
  `CREATE TABLE IF NOT EXISTS invite (guild_id TEXT NOT NULL, code TEXT NOT NULL, uses INTEGER NOT NULL,
     inviter_id TEXT NOT NULL, PRIMARY KEY (guild_id, code))`,
];

/** The Durable Object's SQL handle, as the runtime gives it. */
export interface SqlLike {
  exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[] };
}

export interface CachedMessage {
  readonly id: string;
  readonly guildId: string;
  readonly channelId: string;
  readonly authorId: string;
  readonly author: string;
  readonly content: string;
  readonly files: readonly string[];
  readonly at: number;
}
export interface CachedMember {
  readonly nick: string;
  readonly roles: readonly string[];
}
export interface VoiceSeat {
  readonly channelId: string;
  readonly since: number;
}
export interface InviteCount {
  readonly code: string;
  readonly uses: number;
  readonly inviterId: string;
}

export interface Cache {
  putMessage(message: CachedMessage): void;
  getMessage(id: string): CachedMessage | null;
  editMessage(id: string, content: string): void;
  dropMessage(id: string): void;
  /** Forget messages older than `beforeMs`. */
  sweepMessages(beforeMs: number): void;
  getMember(guildId: string, userId: string): CachedMember | null;
  putMember(guildId: string, userId: string, member: CachedMember): void;
  dropMember(guildId: string, userId: string): void;
  getVoice(guildId: string, userId: string): VoiceSeat | null;
  putVoice(guildId: string, userId: string, channelId: string, since: number): void;
  dropVoice(guildId: string, userId: string): void;
  /** Everyone in voice in a server. */
  inVoice(guildId: string): Array<VoiceSeat & { readonly userId: string }>;
  invites(guildId: string): Map<string, { readonly uses: number; readonly inviterId: string }>;
  putInvites(guildId: string, list: readonly InviteCount[]): void;
}

const listOf = (text: unknown): string[] => {
  try {
    const read: unknown = JSON.parse(String(text));
    return Array.isArray(read) ? read.map(String) : [];
  } catch {
    return [];
  }
};

export function createCache(sql: SqlLike): Cache {
  for (const statement of SCHEMA) sql.exec(statement);
  const rows = (query: string, ...bindings: unknown[]) => sql.exec(query, ...bindings).toArray();
  return {
    putMessage(message) {
      sql.exec(
        'INSERT OR REPLACE INTO msg (id, guild_id, channel_id, author_id, author, content, files, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        message.id,
        message.guildId,
        message.channelId,
        message.authorId,
        message.author,
        message.content,
        JSON.stringify(message.files),
        message.at,
      );
    },
    getMessage(id) {
      const row = rows('SELECT * FROM msg WHERE id = ?', id)[0];
      if (!row) return null;
      return {
        id: String(row.id),
        guildId: String(row.guild_id),
        channelId: String(row.channel_id),
        authorId: String(row.author_id),
        author: String(row.author),
        content: String(row.content),
        files: listOf(row.files),
        at: Number(row.at),
      };
    },
    editMessage(id, content) {
      sql.exec('UPDATE msg SET content = ? WHERE id = ?', content, id);
    },
    dropMessage(id) {
      sql.exec('DELETE FROM msg WHERE id = ?', id);
    },
    sweepMessages(beforeMs) {
      sql.exec('DELETE FROM msg WHERE at < ?', beforeMs);
    },
    getMember(guildId, userId) {
      const row = rows('SELECT nick, roles FROM member WHERE guild_id = ? AND user_id = ?', guildId, userId)[0];
      return row ? { nick: String(row.nick), roles: listOf(row.roles) } : null;
    },
    putMember(guildId, userId, member) {
      sql.exec(
        'INSERT OR REPLACE INTO member (guild_id, user_id, nick, roles) VALUES (?, ?, ?, ?)',
        guildId,
        userId,
        member.nick,
        JSON.stringify(member.roles),
      );
    },
    dropMember(guildId, userId) {
      sql.exec('DELETE FROM member WHERE guild_id = ? AND user_id = ?', guildId, userId);
    },
    getVoice(guildId, userId) {
      const row = rows('SELECT channel_id, since FROM voice WHERE guild_id = ? AND user_id = ?', guildId, userId)[0];
      return row ? { channelId: String(row.channel_id), since: Number(row.since) } : null;
    },
    putVoice(guildId, userId, channelId, since) {
      sql.exec(
        'INSERT OR REPLACE INTO voice (guild_id, user_id, channel_id, since) VALUES (?, ?, ?, ?)',
        guildId,
        userId,
        channelId,
        since,
      );
    },
    dropVoice(guildId, userId) {
      sql.exec('DELETE FROM voice WHERE guild_id = ? AND user_id = ?', guildId, userId);
    },
    inVoice(guildId) {
      return rows('SELECT user_id, channel_id, since FROM voice WHERE guild_id = ?', guildId).map((row) => ({
        userId: String(row.user_id),
        channelId: String(row.channel_id),
        since: Number(row.since),
      }));
    },
    invites(guildId) {
      return new Map(
        rows('SELECT code, uses, inviter_id FROM invite WHERE guild_id = ?', guildId).map((row) => [
          String(row.code),
          { uses: Number(row.uses), inviterId: String(row.inviter_id) },
        ]),
      );
    },
    putInvites(guildId, list) {
      sql.exec('DELETE FROM invite WHERE guild_id = ?', guildId);
      for (const invite of list)
        sql.exec(
          'INSERT INTO invite (guild_id, code, uses, inviter_id) VALUES (?, ?, ?, ?)',
          guildId,
          invite.code,
          invite.uses,
          invite.inviterId,
        );
    },
  };
}
