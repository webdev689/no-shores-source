// Travel between places, behind the veil while the next one loads. Where the player stands is kept as they set out:
// a trip that fails takes them back there, and should that fail too, to the hub, told why (`tripBack.ts`); one with
// nowhere left to go stays on the veil, saying why, and Enter tries it again.
import type { Difficulty } from '../heldmap/heldMap.ts';
import { boundWord } from './controls.ts';
import { type Happening, next, onTheSea } from './flow.ts';
import { launchedArrival } from './breachTrips.ts';
import type { InBreach } from './breachView.ts';
import type { TripGame } from './dungeonTrips.ts';
import type { Playing } from './gameFrame.ts';
import type { Hud } from './hud.ts';
import type { IsleHeld } from './isles.ts';
import { arrivalFacing, FIRST_NODE } from './nodes.ts';
import { type Fallback, onOtherLand, type Refuge, placeOf, sentOut, TOLD_MS, tripOrBack } from './tripBack.ts';
import type { NodeInfo } from './worldData.ts';

/** What travel asks of the game: the play, the HUD, the ways into a place on foot (a node, a patrol zone arriving as
 *  asked, a dungeon, a Breach's run) and onto the sea, the island the player stands on and the way onto it, and the
 *  hub's landmass opened where another is. */
export interface TravelGame extends Pick<TripGame, 'intoDungeon' | 'ontoPatrol'> {
  readonly playing: Playing;
  readonly hud: Hud;
  readonly goFoot: (node: NodeInfo, facing: number, seas?: Difficulty) => Promise<void>;
  readonly intoBreach: (into: InBreach) => Promise<void>;
  readonly goSea: () => Promise<void>;
  readonly ashore: () => IsleHeld | null;
  /** Walks ashore on `held` again, as the player stood on it. */
  readonly backAshore: (held: IsleHeld) => Promise<void>;
  readonly hubLand: () => Promise<void>;
  /** Draws a landmass in place of the one shown: the one left, put back when the hub is not reached. */
  readonly showLandmass: (landmass: Playing['landmass']) => void;
}

/** The way back to where the player stands now, joined again: the ship, an island's beach, a dungeon, a Breach's run,
 *  its gate's zone for the run it was joined for (so its room stands them in that run's company again), or a node. */
export function wayBackOf(
  game: Pick<
    TravelGame,
    'playing' | 'goFoot' | 'ontoPatrol' | 'intoDungeon' | 'intoBreach' | 'goSea' | 'ashore' | 'backAshore'
  >,
): Refuge | null {
  const { flow, foot } = game.playing;
  if (onTheSea(flow)) return { flow: { mode: 'sea' }, go: game.goSea };
  if (flow.mode !== 'foot' || !foot) return null;
  const [stood, { node, dungeon, text, seas, run, launchedFor }, held] = [flow, foot, game.ashore()];
  if (dungeon)
    return { flow: stood, go: () => game.intoDungeon({ node: dungeon.patrol, text }, dungeon, dungeon.layout, seas) };
  // A Breach's run is joined again by its name, as its room lets its company back in.
  if (run) return { flow: stood, go: () => game.intoBreach(run) };
  if (launchedFor) return { flow: stood, go: () => game.ontoPatrol(node, 0, seas, launchedArrival(launchedFor)) };
  if (held) return { flow: stood, go: () => game.backAshore(held) };
  return { flow: stood, go: () => game.goFoot(node, arrivalFacing(node, game.playing.landmass.plan, null), seas) };
}

/** Starts travel for `game`: `travel` takes the player elsewhere as `happening` asks, by `work`; `behindVeil` runs
 *  work behind the veil (with no way back: the first arrival); `retry` is the trip that waits on Enter; `tell` shows
 *  the player why they are not where they went. */
export function startTravel(game: TravelGame) {
  const { playing, hud } = game;
  const tell = (words: string) => void (playing.told = { words, until: performance.now() + TOLD_MS });
  /** A way that failed, tried again with Enter. */
  let retry: (() => void) | null = null;

  /** Runs `work` behind the veil showing `words`; the veil lifts once it is done and the ground has come, where the
   *  trip went or wherever `fallback` took the player instead. */
  const behindVeil = (words: string, work: () => Promise<void>, fallback?: Fallback) => {
    retry = null;
    [playing.ready, playing.waited, playing.told] = [false, 0, null];
    hud.veil(words);
    (fallback ? tripOrBack(work, fallback, (said) => hud.veil(said)) : work().then(() => null))
      .then((instead) => {
        if (instead) {
          playing.flow = { mode: 'loading', words: instead.told, then: instead.flow };
          tell(instead.told);
        }
        playing.ready = true;
      })
      .catch((error: unknown) => {
        const why = error instanceof Error ? error.message : String(error);
        hud.veil(`${words} failed: ${why}. Press ${boundWord('confirm')} to try again.`, false);
        retry = () => behindVeil(words, work, fallback);
      });
  };

  const wayBack = () => wayBackOf(game);

  /** The hub, Overlook's social space, where a trip with no way back ends. */
  const hub: Fallback['hub'] = {
    name: 'Overlook',
    flow: { mode: 'foot', node: FIRST_NODE },
    go: () =>
      onOtherLand({ now: () => playing.landmass, open: game.hubLand, put: game.showLandmass }, async () => {
        const node = playing.landmass.nodes.find((each) => each.id === FIRST_NODE);
        if (!node) throw new Error('Overlook has no social space');
        await game.goFoot(node, arrivalFacing(node, playing.landmass.plan, null));
      }),
  };

  const travel = (happening: Happening, work: () => Promise<void>) => {
    const after = next(playing.flow, happening);
    if (after === playing.flow || after.mode !== 'loading') return;
    // Where the player stands is kept before they leave it; a place that sent them out would only do so again.
    const back = sentOut(happening) ? null : wayBack();
    const place = placeOf(after.then, happening, (id) => playing.landmass.nodes.find((node) => node.id === id)?.name);
    playing.flow = after;
    document.exitPointerLock();
    behindVeil(after.words, work, { place, back, hub });
  };

  return { travel, behindVeil, retry: () => retry, tell };
}
