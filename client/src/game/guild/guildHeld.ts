import type { AccountLink } from '../../network/accounts.ts';
import { bannerFrom, hexOf } from './bannerLaw.ts';
import { ACCOUNT_CHANGED, GUILD_CHANGED, OUTPOST_CHANGED } from '../gearScreen.ts';

/**
 * What the page keeps of the player's guild away from its tab: the key its outposts' rooms are named by, its banner
 * and the sites its outposts stand at, read from the accounts at the start and again whenever the account, the guild
 * or an outpost changes. A player in no guild, or with no accounts, holds none.
 */
export interface Held {
  readonly key: string;
  readonly banner: Readonly<Record<string, unknown>>;
  readonly sites: readonly string[];
}

let held: Promise<Held | null> = Promise.resolve(null);
let accounts: AccountLink | null = null;
let landed: Held | null = null;
const heard = new Set<() => void>();

/** Reads the guild once from the accounts: null in none, or when the accounts do not answer. */
async function readGuild(link: AccountLink): Promise<Held | null> {
  const answer = await link.guild();
  const guild = typeof answer === 'string' ? null : answer.guild;
  if (!guild?.key) return null;
  const outposts = await link.outposts().catch(() => null);
  const sites = !outposts || typeof outposts === 'string' ? [] : outposts.outposts.map((outpost) => outpost.site);
  return { key: guild.key, banner: guild.banner, sites };
}

/** Keeps the player's guild as the accounts say it, now and after each change. */
export function keepGuild(link: AccountLink): void {
  accounts = link;
  const read = () => {
    held = readGuild(link).catch(() => null);
    void held.then((guild) => {
      landed = guild;
      heard.forEach((listener) => listener());
    });
  };
  read();
  for (const changed of [ACCOUNT_CHANGED, GUILD_CHANGED, OUTPOST_CHANGED]) addEventListener(changed, read);
}

/** The player's guild as last read (waiting on a read under way). */
export const guildHeld = (): Promise<Held | null> => held;

/** The link to the accounts the guild is read from; null offline. */
export const accountsHeld = (): AccountLink | null => accounts;

/** The colours a site's mark wears where the player's guild holds an outpost there: its banner's cloth round its
 *  device's colour; null at any other site, or before the guild is read. */
export function ownOutpostColours(site: string): { readonly cloth: string; readonly device: string } | null {
  if (!landed?.sites.includes(site)) return null;
  const banner = bannerFrom(landed.banner);
  return banner ? { cloth: hexOf(banner.cloth), device: hexOf(banner.deviceColour) } : null;
}

/** Calls `listener` each time a read of the guild lands. */
export function onGuildHeld(listener: () => void): void {
  heard.add(listener);
}
