// The ways onto foot that join a run's own room: a dungeon's, from its node's entrance, and a Breach's, from its gate.
// Each stands the page's movement and fight on the place's own ground as its room stands its bodies, then joins it.
import { loadRunModules } from '../city/modules.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import { RoomConnection, type Snapshot } from '../network/roomConnection.ts';
import { blocksGround, planBlocks, runPlace, slabStands, socketBearing, spaceSocket } from './breachPlan.ts';
import type { InBreach } from './breachView.ts';
import { type DungeonAsk, type DungeonLayout, seenBlocks } from './dungeonLayout.ts';
import { Foot, type FootContext } from './foot.ts';
import { stand } from './footPlace.ts';
import { rulesOf } from './footRoom.ts';
import { dungeonPlace, openAlone, standInDungeon } from './footTrips.ts';
import type { NodeInfo } from './worldData.ts';

/** Takes the player into the dungeon `into` names (its number among the entrances of the place `outside`, whose node
 *  file's text a room alone opens it from, the ask it is laid by and its room's name), at its way in, and joins its
 *  room: online the server's, alone one in the rooms' worker. */
export async function enterDungeon(
  context: FootContext,
  outside: { readonly node: NodeInfo; readonly text: string },
  into: { readonly number: number; readonly ask: DungeonAsk; readonly room: string },
  layout: DungeonLayout,
  seas: Difficulty = 'normal',
): Promise<Foot> {
  const rules = await rulesOf(context);
  const module = await context.roomModule;
  standInDungeon(context.movement, rules.combat, into.ask);
  stand(context, layout.arrival.x, layout.arrival.y, layout.arrival.bearing, false);
  const address = context.rooms?.(into.room);
  const dungeon = { patrol: outside.node, ...into, layout };
  return Foot.start(context, dungeonPlace(outside.node, layout), rules, async (heard, session) => ({
    link: address
      ? await RoomConnection.open(address, heard.snapshot, heard.gear, session)
      : await openAlone(module, outside.text, into, heard),
    boxes: seenBlocks(layout),
    text: outside.text,
    dungeon,
    seas,
  }));
}

/** Which of a run's seals are open and slabs stand at a tick, as one key: a course is made anew only when it changes. */
const courseKey = (into: InBreach, seals: number, tick: number) =>
  `${seals}:${into.plan.slabs.map((slab) => Number(slabStands(into.plan, slab.phase, tick))).join('')}`;

/** Takes the player into a Breach's run, at the Descent's arrival, and joins its room: the server's alone, which lets
 *  in only a company whose gate has opened. The page's movement and fight stand on its blocks over the dark as each
 *  snapshot says its seals and its slabs stand. */
export async function enterBreachRun(context: FootContext, into: InBreach): Promise<Foot> {
  const { rooms, movement } = context;
  if (!rooms) throw new Error('a Breach is played online');
  // Its spaces' meshes come before the veil lifts on it; they are let go once the player is out (`gameFrame.ts`).
  const [rules] = await Promise.all([rulesOf(context), loadRunModules()]);
  const blocks = planBlocks(into.plan, 0, 0);
  movement.setCourse(blocks);
  movement.setGround(null);
  rules.combat.setGround(null);
  // The rules keep the run's last seals and slabs over any course set since: asked once with every seal open, its
  // course is made anew whatever was kept.
  rules.combat.setBreach(0xff, 0);
  rules.combat.setBreach(0, 0);
  const [x, y, z] = spaceSocket(into.plan, 'descent', 'arrival') ?? [0, 0, 0];
  const descent = into.plan.spaces.find((space) => space.key === 'descent');
  stand(context, x, y, socketBearing('breach-descent', 'arrival', descent?.turn ?? 0), false);
  // The movement rules stand a body on open ground at 0 m: the run's arrival stands high over the dark.
  const { walker } = context;
  const body = { ...walker.player.body, z };
  walker.player = { ...walker.player, body, previous: body };
  let kept = courseKey(into, 0, 0);
  const keep = (snapshot: Snapshot) => {
    const [seals, tick] = [snapshot.breach?.seals ?? 0, Number(snapshot.tick)];
    const key = courseKey(into, seals, tick);
    if (key === kept) return;
    kept = key;
    movement.setCourse(planBlocks(into.plan, seals, tick));
    rules.combat.setBreach(seals, tick);
  };
  return Foot.start(context, runPlace(into), rules, async (heard, session) => {
    const hear = (snapshot: Snapshot) => {
      heard.snapshot(snapshot);
      keep(snapshot);
    };
    const link = await RoomConnection.open(rooms(into.run), hear, heard.gear, session);
    return { link, boxes: blocks, text: '', dungeon: null, seas: 'normal', run: into, groundAt: blocksGround(blocks) };
  });
}
