// The ways onto foot that join a run's own room: a dungeon's, from its node's entrance, and a Breach's, from its gate.
// Each stands the page's movement and fight on the place's own ground as its room stands its bodies, then joins it.
import { loadRunModules, loadSealModule } from '../city/modules.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import { breachAsk } from '../../../server/roomNames.ts';
import { RoomConnection, type Snapshot } from '../network/roomConnection.ts';
import { RoomThread } from '../network/roomThread.ts';
import { roomNow } from '../sky/worldClock.ts';
import { blocksGround, runPlace, socketBearing, spaceSocket, standingBlocks } from './breachPlan.ts';
import type { InBreach } from './breachView.ts';
import { type DungeonAsk, type DungeonLayout, seenBlocks } from './dungeonLayout.ts';
import { Foot, type FootContext } from './foot.ts';
import { stand } from './footPlace.ts';
import { rulesOf } from './footRoom.ts';
import { dungeonPlace, openAlone, standInDungeon, standInPassage } from './footTrips.ts';
import type { NodeInfo } from './worldData.ts';

/** Takes the player into the dungeon `into` names (its number among the entrances of the place `outside`, whose node
 *  file's text a room alone opens it from, the ask it is laid by and its room's name), at its way in, and joins its
 *  room: online the server's, alone one in the rooms' worker; or into a passage zone under ground, on its own ground
 *  and through its own link (`passage`). */
export async function enterDungeon(
  context: FootContext,
  outside: { readonly node: NodeInfo; readonly text: string },
  into: { readonly number: number; readonly ask: DungeonAsk; readonly room: string },
  layout: DungeonLayout,
  seas: Difficulty = 'normal',
  passage?: Parameters<typeof standInPassage>[2],
): Promise<Foot> {
  const rules = await rulesOf(context);
  const module = await context.roomModule;
  if (passage) standInPassage(context.movement, rules.combat, passage);
  else standInDungeon(context.movement, rules.combat, into.ask);
  stand(context, layout.arrival.x, layout.arrival.y, layout.arrival.bearing, false);
  const address = context.rooms?.(into.room);
  const dungeon = { patrol: outside.node, ...into, layout, passage: !!passage };
  return Foot.start(context, dungeonPlace(outside.node, layout), rules, async (heard, session) => ({
    link: passage
      ? await passage.link(heard, session)
      : address
        ? await RoomConnection.open(address, heard.snapshot, heard.gear, session)
        : await openAlone(module, outside.text, into, heard, seas),
    boxes: passage?.blocks ?? seenBlocks(layout),
    text: outside.text,
    dungeon,
    seas,
  }));
}

/** Takes the player into a Breach's run, at the Descent's arrival, and joins its room: the server's alone, which lets
 *  in only a company whose gate has opened. The page's movement and fight, and the run's own ground, stand on its
 *  blocks over the dark as each snapshot says its seals and its slabs stand. */
export async function enterBreachRun(context: FootContext, into: InBreach): Promise<Foot> {
  const { rooms, movement } = context;
  // Played alone only on a development page, for its pictures (`&run=`): a player's Breach is online.
  if (!rooms && !import.meta.env.DEV) throw new Error('a Breach is played online');
  // Its spaces' meshes come before the veil lifts on it; they are let go once the player is out (`gameFrame.ts`).
  const [rules] = await Promise.all([rulesOf(context), loadRunModules(), loadSealModule()]);
  const { blocks, keep } = standingBlocks(into.plan, (seals, tick) => {
    movement.setCourse(blocks);
    rules.combat.setBreach(seals, tick);
  });
  movement.setCourse(blocks);
  movement.setGround(null);
  // Open ground forgets the run's last seals and slabs, so the rules make its course anew.
  rules.combat.setGround(null);
  rules.combat.setBreach(0, 0);
  const [x, y, z] = spaceSocket(into.plan, 'descent', 'arrival') ?? [0, 0, 0];
  const descent = into.plan.spaces.find((space) => space.key === 'descent');
  stand(context, x, y, socketBearing('breach-descent', 'arrival', descent?.turn ?? 0), false);
  // The movement rules stand a body on open ground at 0 m: the run's arrival stands high over the dark.
  const { walker } = context;
  const body = { ...walker.player.body, z };
  walker.player = { ...walker.player, body, previous: body };
  return Foot.start(context, runPlace(into), rules, async (heard, session) => {
    const hear = (snapshot: Snapshot) => {
      heard.snapshot(snapshot);
      keep(snapshot.breach?.seals ?? 0, Number(snapshot.tick));
    };
    const ask = rooms ? null : breachAsk(into.run, Math.floor(roomNow() / 60_000));
    const link = rooms
      ? await RoomConnection.open(rooms(into.run), hear, heard.gear, session)
      : await RoomThread.openBreach(await context.roomModule, ask ?? '', hear, heard.gear);
    return { link, boxes: blocks, text: '', dungeon: null, seas: 'normal', run: into, groundAt: blocksGround(blocks) };
  });
}
