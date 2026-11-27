import { WorkerEntrypoint } from 'cloudflare:workers';
import { handle } from './accounts.ts';
import { type Characters, type Claimed, characters } from './characters.ts';
import type { Developers } from './developers.ts';
import type { CompanyFinder } from './finder.ts';
import { findingAt } from './finding.ts';
import { type LinkedCharacter, linkedCharacter, linkedPledges } from './linked.ts';
import { type ChatHall, chatAt } from './chat.ts';

export { CompanyFinder } from './finder.ts';
export { ChatHall } from './chat.ts';

interface Env {
  readonly DB: D1Database;
  /** Find a Company's queues, one for each run's base (`finder.ts`). */
  readonly FINDERS: DurableObjectNamespace<CompanyFinder>;
  /** The chat's one hall (`chat.ts`). */
  readonly CHATS: DurableObjectNamespace<ChatHall>;
  /** The pages, by origin and path and space-separated, a Discord sign-in may come back to. */
  readonly PAGES: string;
  /** The Discord app's keys, as the Worker's secrets; without them, Discord sign-in says it is not set up. */
  readonly DISCORD_CLIENT_ID?: string;
  readonly DISCORD_CLIENT_SECRET?: string;
  /** The bot's Members (`bot/main.ts`), which says who is a developer; without it, no one is. */
  readonly BOT?: Developers;
  /** Cloudflare's count of sign-ins by address (`wrangler.jsonc`'s `ratelimits`). */
  readonly SIGN_INS?: RateLimit;
}

const wait = (millis: number) => new Promise<void>((resolve) => setTimeout(resolve, millis));

/** The characters, for the rooms alone: reached only through the rooms' service binding, never from the web. */
export class CharacterKeeper extends WorkerEntrypoint<Env> implements Characters {
  private readonly kept = characters(this.env.DB, Date.now, wait, this.env.BOT ?? null);

  look(token: string): Promise<Claimed | null> {
    return this.kept.look(token);
  }

  claim(token: string, holder: string): Promise<Claimed | null> {
    return this.kept.claim(token, holder);
  }

  save(account: string, holder: string, body: string, vault: string): Promise<boolean> {
    return this.kept.save(account, holder, body, vault);
  }

  release(account: string, holder: string, body: string | null, vault: string | null): Promise<boolean> {
    return this.kept.release(account, holder, body, vault);
  }

  present(token: string, room: string | null, water: string | null = null): Promise<boolean> {
    return this.kept.present(token, room, water);
  }

  companions(account: string, room: string): Promise<string[]> {
    return this.kept.companions(account, room);
  }

  launched(account: string, room: string, within?: number): Promise<boolean> {
    return this.kept.launched(account, room, within);
  }

  forgetRun(room: string): Promise<boolean> {
    return this.kept.forgetRun(room);
  }

  guild(account: string): ReturnType<Characters['guild']> {
    return this.kept.guild(account);
  }

  deposit(...asked: Parameters<Characters['deposit']>): ReturnType<Characters['deposit']> {
    return this.kept.deposit(...asked);
  }

  deliver(...asked: Parameters<Characters['deliver']>): ReturnType<Characters['deliver']> {
    return this.kept.deliver(...asked);
  }

  takeStores(...asked: Parameters<Characters['takeStores']>): ReturnType<Characters['takeStores']> {
    return this.kept.takeStores(...asked);
  }

  soundHorn(...asked: Parameters<Characters['soundHorn']>): ReturnType<Characters['soundHorn']> {
    return this.kept.soundHorn(...asked);
  }

  outpost(room: string): ReturnType<Characters['outpost']> {
    return this.kept.outpost(room);
  }

  developer(token: string): ReturnType<Characters['developer']> {
    return this.kept.developer(token);
  }
}

/** A Discord member's linked character, for the Discord bot alone: reached only through its service binding. */
export class LinkedCharacters extends WorkerEntrypoint<Env> {
  linked(discordId: string): Promise<LinkedCharacter | null> {
    return linkedCharacter(this.env.DB, String(discordId));
  }

  pledges(discordIds: string[]): Promise<Record<string, string | null>> {
    return linkedPledges(this.env.DB, discordIds);
  }
}

/** The accounts' web API (`accounts.ts`). */
export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const finding = findingAt(request);
    if (finding !== null) return env.FINDERS.getByName(finding).fetch(request);
    if (chatAt(request)) return env.CHATS.getByName('hall').fetch(request);
    const discord =
      env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET
        ? {
            id: env.DISCORD_CLIENT_ID,
            secret: env.DISCORD_CLIENT_SECRET,
            fetch: (...asked: Parameters<typeof fetch>) => fetch(...asked),
          }
        : null;
    const pages = env.PAGES.split(/\s+/).filter(Boolean);
    const signIns = env.SIGN_INS ?? null;
    return handle(request, { database: env.DB, now: Date.now, discord, pages, bot: env.BOT ?? null, signIns });
  },
} satisfies ExportedHandler<Env>;
