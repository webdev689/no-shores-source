import type { AccountLink } from '../../network/accounts.ts';
import { bannerFrom, hexOf } from './bannerLaw.ts';
import { ACCOUNT_CHANGED, GUILD_CHANGED, OUTPOST_CHANGED } from '../gearScreen.ts';

/**
 * What the page keeps of the player's guild away from its tab: the key its outposts' rooms are named by, its banner
 * the sites its outposts stand at, the player's rank in it (0 founder, 1 admin, 2 member), whether its level allows
 * another outpost and whether its War Horn has sounded this week, read from the accounts at the start, again whenever
 * the account, the guild or an outpost changes, and before an outpost's room is named, so a removal by an admin is
 * taken then. A player in no guild, or with no accounts, holds none.
 */
export interface Held {
  readonly key: string;
  readonly rank: number;
  readonly banner: Readonly<Record<string, unknown>>;
  readonly sites: readonly string[];
  readonly allowsAnother: boolean;
  readonly hornSounded: boolean;
}

/** How long after a failed read the guild is read again, as it is next asked for, milliseconds. */
const RETRY_MS = 10_000;

let held: Promise<Held | null> = Promise.resolve(null);
let accounts: AccountLink | null = null;
let landed: Held | null = null;
let reads = 0;
/** When the last read failed, on the wall clock; null while the last read answered or one is under way. */
let failedAt: number | null = null;
/** The guilds read whose outposts failed to read: kept as read, and read again as a failed read is. */
const partial = new WeakSet<Held>();

/** Reads the guild once from the accounts: null in none, undefined when the accounts do not answer. Where only its
 *  outposts fail to read, what was last read of them is kept, so the map keeps marking its sites. */
async function readGuild(link: AccountLink): Promise<Held | null | undefined> {
  const answer = await link.guild();
  if (typeof answer === 'string') return undefined;
  const { guild } = answer;
  if (!guild?.key) return null;
  const outposts = await link.outposts().catch(() => null);
  const { key, rank, banner } = guild;
  if (!outposts || typeof outposts === 'string') {
    const kept = landed?.key === key ? landed : { sites: [], allowsAnother: false, hornSounded: false };
    const half = { ...kept, key, rank, banner };
    partial.add(half);
    return half;
  }
  const sites = outposts.outposts.map((outpost) => outpost.site);
  const allowsAnother = sites.length < outposts.allowed;
  return { key, rank, banner, sites, allowsAnother, hornSounded: outposts.hornSounded === true };
}

/** Keeps the player's guild as the accounts say it, now and after each change; the first read's answer. */
export function keepGuild(link: AccountLink): Promise<Held | null> {
  accounts = link;
  for (const changed of [ACCOUNT_CHANGED, GUILD_CHANGED, OUTPOST_CHANGED]) addEventListener(changed, read);
  return read();
}

/** Reads the guild again, keeping only the latest answer. */
function read(): Promise<Held | null> {
  const link = accounts;
  if (!link) return held;
  const number = ++reads;
  failedAt = null;
  const reading = readGuild(link).catch(() => undefined);
  // A failed read keeps the guild last read, so a blip never takes a member out of their guild's room.
  held = reading.then((guild) => (guild === undefined ? landed : guild));
  void reading.then((guild) => {
    if (number !== reads) return;
    failedAt = guild === undefined || (guild !== null && partial.has(guild)) ? Date.now() : null;
    if (guild !== undefined) landed = guild;
  });
  return held;
}

/** The player's guild read afresh, as an outpost's room is named by it. */
export const guildRead = (): Promise<Held | null> => read();

/** The player's guild as the last read that answered left it, at once; where the last read failed a while ago, it is
 *  read again, so a failure at the start never leaves the map's marks and the outpost's prompts without the guild. */
export function guildLanded(): Held | null {
  if (failedAt !== null && Date.now() - failedAt >= RETRY_MS) void read();
  return landed;
}

/** The link to the accounts the guild is read from; null offline. */
export const accountsHeld = (): AccountLink | null => accounts;

/** The colours a site's mark wears where the player's guild holds an outpost there: its banner's cloth round its
 *  device's colour; null at any other site, or before the guild is read. */
export function ownOutpostColours(site: string): { readonly cloth: string; readonly device: string } | null {
  const guild = guildLanded();
  if (!guild?.sites.includes(site)) return null;
  const banner = bannerFrom(guild.banner);
  return banner ? { cloth: hexOf(banner.cloth), device: hexOf(banner.deviceColour) } : null;
}
