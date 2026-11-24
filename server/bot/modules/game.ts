// The game: a member's linked No Shores character in the bot's messages, read from the accounts through their
// service binding, and /link, which says how to link one. The link itself is the accounts' own (Discord sign-in).

import { GAME_SLOTS } from '../law/gameShape.ts';
import { privateReply } from '../kit.ts';
import type { ServerModule } from './module.ts';

/** Where the game is played. */
export const GAME_URL = 'https://lattymoy.github.io/no-shores-source/';
/** /link's answer, in the account tab's own words (`client/src/game/accountTab.ts`). */
export const LINK_WORDS = `Open the game at ${GAME_URL}, then in Settings open Account and press Sign in or link with Discord.`;

const said = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const gameModule: ServerModule = {
  id: 'game',
  commands: [{ name: 'link', description: 'How to link your No Shores character', type: 1, contexts: [0] }],
  command: () => Promise.resolve(privateReply(LINK_WORDS)),
  slots: {
    names: GAME_SLOTS,
    async fill(context, guildId, user, _vars, fresh) {
      const saved = fresh ?? (await context.config(guildId, 'game'))?.config;
      const unlinked = String(saved?.notLinked ?? '');
      const accounts = context.vars.ACCOUNTS;
      const found =
        accounts && user.id
          ? await accounts.linked(String(user.id)).catch((error: unknown) => {
              context.log(`[bot] game: the accounts did not answer: ${said(error)}`);
              return null;
            })
          : null;
      if (!found) return { character: unlinked, character_level: unlinked, character_faction: unlinked };
      return {
        character: found.name ?? '',
        character_level: String(found.level ?? ''),
        character_faction: found.faction ?? '',
      };
    },
  },
};
