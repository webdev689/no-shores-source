/**
 * Who is a developer: an account linked to a Discord account that holds a developer's role in the No Shores Discord,
 * as the bot says through its binding (`bot/main.ts`). The bot asks Discord each time, so a role given or taken
 * counts at once. An account with no Discord, or a bot that does not answer, is no developer.
 */

import type { Db } from './database.ts';

/** The bot's one question, as its `Members` entrypoint answers it. */
export interface Developers {
  developer(discordId: string): Promise<boolean>;
}

/** Whether the account is a developer's; false without the bot, without Discord, or while the bot does not answer. */
export async function isDeveloper(database: Db, bot: Developers | null, account: string): Promise<boolean> {
  if (!bot) return false;
  const row = await database
    .prepare('SELECT discord_id FROM accounts WHERE id = ?1')
    .bind(account)
    .first<{ discord_id: string | null }>();
  if (!row?.discord_id) return false;
  return bot.developer(row.discord_id).catch((error: unknown) => {
    console.error('developer:', error);
    return false;
  });
}
