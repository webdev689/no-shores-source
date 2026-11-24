import type { AccountLink } from '../../network/accounts.ts';
import { bannerFrom, hexOf } from './bannerLaw.ts';
import { ACCOUNT_CHANGED, GUILD_CHANGED, OUTPOST_CHANGED } from '../gearScreen.ts';

/**
 * What the page keeps of the player's guild away from its tab: the key its outposts' rooms are named by, its banner
 * the sites its outposts stand at and the player's rank in it (0 founder, 1 admin, 2 member), read from the accounts at
 * the start, again whenever the account, the guild or an outpost changes, and before an outpost's room is named, so a
 * removal by an admin is taken then. A player in no guild, or with no accounts, holds none.
 */
export interface Held {
  readonly key: string;
  readonly rank: number;
  readonly banner: Readonly<Record<string, unknown>>;
  readonly sites: readonly string[];
}

let held: Promise<Held | null> = Promise.resolve(null);
let accounts: AccountLink | null = null;
let landed: Held | null = null;
let reads = 0;
let failed = false;

/** Reads the guild once from the accounts: null in none, undefined when the accounts do not answer. */
async function readGuild(link: AccountLink): Promise<Held | null | undefined> {
  const answer = await link.guild();
  if (typeof answer === 'string') return undefined;
  const { guild } = answer;
  if (!guild?.key) return null;
  const outposts = await link.outposts().catch(() => null);
  const sites = !outposts || typeof outposts === 'string' ? [] : outposts.outposts.map((outpost) => outpost.site);
  return { key: guild.key, rank: guild.rank, banner: guild.banner, sites };
}

/** Keeps the player's guild as the accounts say it, now and after each change. */
export function keepGuild(link: AccountLink): void {
  accounts = link;
  read();
  for (const changed of [ACCOUNT_CHANGED, GUILD_CHANGED, OUTPOST_CHANGED]) addEventListener(changed, read);
}

/** Reads the guild again, keeping only the latest answer; a failed read is tried again at the next ask for it. */
function read(): Promise<Held | null> {
  const link = accounts;
  if (!link) return held;
  const number = ++reads;
  failed = false;
  const reading = readGuild(link).catch(() => undefined);
  held = reading.then((guild) => guild ?? null);
  void reading.then((guild) => {
    if (number !== reads) return;
    failed = guild === undefined;
    if (!failed) landed = guild ?? null;
  });
  return held;
}

/** The player's guild as last read (waiting on a read under way), read again where the last read failed. */
export const guildHeld = (): Promise<Held | null> => (failed ? read() : held);

/** The player's guild read afresh, as an outpost's room is named by it. */
export const guildRead = (): Promise<Held | null> => read();

/** The player's guild as the last read that answered left it, at once. */
export const guildLanded = (): Held | null => landed;

/** The link to the accounts the guild is read from; null offline. */
export const accountsHeld = (): AccountLink | null => accounts;

/** The colours a site's mark wears where the player's guild holds an outpost there: its banner's cloth round its
 *  device's colour; null at any other site, or before the guild is read. */
export function ownOutpostColours(site: string): { readonly cloth: string; readonly device: string } | null {
  if (!landed?.sites.includes(site)) return null;
  const banner = bannerFrom(landed.banner);
  return banner ? { cloth: hexOf(banner.cloth), device: hexOf(banner.deviceColour) } : null;
}
