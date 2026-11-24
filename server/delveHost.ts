/**
 * The host's side of a guild dungeon's run (`delveRoom.ts`): the ask its room opens from, a sea island's dungeon in its
 * site's continent, laid by the guild's key and the week its run's name carries, at the run's tier, with the guild's
 * key so its clear pays the guild package. It opens only on an outpost's site while that guild's Delve Gate stands at
 * the run's tier or higher, as the accounts keep its plot.
 */

import { delveLaid, gateTier } from '../client/src/game/guild/delveRoom.ts';
import { weekOf } from '../client/src/game/guild/guildLaw.ts';
import type { Plot } from '../client/src/game/guild/outpostLaw.ts';
import { outpostGround } from './outpostHost.ts';
import { delveWeek, nodeRoom } from './roomNames.ts';

/** The ask `open_run` opens a guild dungeon's run `room` from at Unix `minute`: null for a room that is no guild
 *  dungeon's run, a site that is no outpost's, or a gate that does not stand at the run's tier. `outpost` reads an
 *  outpost's room's plot from the accounts, `nodeText` a node's baked file. */
export async function delveAsk(
  room: string,
  minute: number,
  outpost: (room: string) => Promise<{ readonly plot: Plot } | null>,
  nodeText: (id: string) => Promise<string | null>,
): Promise<string | null> {
  const named = room.startsWith('node-') ? nodeRoom(room.slice('node-'.length)) : null;
  if (!named || named.guild === null || named.run === null) return null;
  const text = await nodeText(named.id);
  const continent = text === null ? null : (JSON.parse(text) as { continent?: string }).continent;
  if (text === null || continent === undefined || continent === null || !outpostGround(text)) return null;
  const read = await outpost(`node-${named.id}--guild-${named.guild}`).catch(() => null);
  const most = read ? gateTier(read.plot) : null;
  if (most === null || most < named.seas) return null;
  // Laid for the week its name carries: this week's, last week's for a run opened before the turn, or next week's
  // for one named by a page whose clock turned a little before the host's.
  const [week, now] = [delveWeek(named.run), weekOf(minute * 60_000)];
  if (Math.abs(week - now) > 1) return null;
  const { seed, style } = delveLaid(named.guild, week);
  return JSON.stringify({ dungeon: { seed, style, continent }, tier: named.seas, minute, guild: named.guild });
}
