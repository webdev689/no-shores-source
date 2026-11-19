// The owner's fifth beat, played: the ships that came out of the dark are fought with the sea's own fight (its
// camera, its aim and its guns), the Brig drawn as hers with her crew at work, the crew crying out as she is struck,
// as her balls strike home and as each ship goes down; it ends once every one is beaten, sunk or struck.
import { forwardOf, poseOf } from '../../overworld/overworldCamera.ts';
import { shipSails } from '../../ships/shipMesh.ts';
import { HINTS } from '../hints.ts';
import type { Beat, Tick } from './beat.ts';
import { type Ambusher, StoryFight, type StoryFightFrame } from './fightAtSea.ts';
import { youAtHelm } from './helm.ts';
import { storyCue } from './music.ts';
import type { Sailed, ShipDraw } from './sailing.ts';
import { STORM_SOUND } from './sighted.ts';
import { STORM } from './skies.ts';
import type { StoryFrame } from './stage.ts';
import type { Story } from './story.ts';

/** The fewest seconds between two of the crew's cries of one kind, so a hail of hits is not a hail of words. */
const CRY_GAP_S = { 'hit-taken': 7, 'hit-given': 9, sinking: 3 } as const;
const FAR_M = 30_000;
/** A beaten captain's Sloop is drawn as dark as the fight drew her. */
const WRECK_SHADE = 0.55;

/** The ships the sighted beat showed, as the fight takes them up: each one's bearing off her bow and distance. */
export function ambushersFrom(story: Story, inbound: readonly Sailed[]): Ambusher[] {
  const { brig } = story;
  return inbound.map((ship) => {
    const bearing = Math.atan2(ship.x - brig.x, brig.y - ship.y) - brig.heading;
    return {
      bearing: Math.atan2(Math.sin(bearing), Math.cos(bearing)),
      distanceM: Math.hypot(ship.x - brig.x, ship.y - brig.y),
      faction: 2,
      rank: 2,
      heading: ship.heading,
    };
  });
}

/** What is left to do, for as long as the fight lasts. */
export function shipsLeft(left: number, total: number): string {
  return `Ships left: ${left} of ${total}.`;
}

/** A beaten Sloop lying where she is, her sails furled: low in the water, or, `going` down, lower and settling on. */
export function asWreck(
  ship: { readonly x: number; readonly y: number; readonly heading: number },
  going: boolean,
): Sailed {
  const { x, y, heading } = ship;
  return {
    who: `wreck-${x}-${y}`,
    hull: 'sloop',
    x,
    y,
    heading,
    underWay: false,
    shade: WRECK_SHADE,
    sinking: going ? 0.3 : 0.1,
  };
}

/** The beaten captains' Sloops where the fight left them, as the calm keeps them: struck ones lying still, ones going
 *  down still settling. The sunk are gone. */
export function wrecksOf(frame: StoryFightFrame | null): Sailed[] {
  const captains = frame?.ships.filter((ship) => ship.hull === 'captain') ?? [];
  return captains
    .filter((ship) => ship.state === 'struck' || ship.state === 'sinking')
    .map((ship) => asWreck(ship.place, ship.state === 'sinking'));
}

export class Battle implements Beat {
  readonly name = 'battle';
  readonly skippable = false;
  private readonly story: Story;
  private readonly ambushers: readonly Ambusher[];
  private fight: StoryFight | null = null;
  private begun = false;
  /** Why the fight could not begin, thrown from the next frame for the director to go on past it. */
  private failure: unknown = null;
  private last: StoryFightFrame | null = null;
  private readonly cried = new Map<string, number>();
  private clock = 0;
  done = false;

  constructor(story: Story, inbound: readonly Sailed[]) {
    this.story = story;
    this.ambushers = ambushersFrom(story, inbound);
    storyCue('battle');
    const { brig, stage } = story;
    stage.weatherTowards(STORM, 2);
    stage.parts.ambience.set(STORM_SOUND, 1.5);
    story.lightning.striking = true;
    brig.way = 0;
  }

  /** The fight begun on the story's clock, so its first words ("A ... is sighted") are on the panel a while. */
  private begin(now: number): void {
    this.begun = true;
    const { brig, land, marks, stage } = this.story;
    StoryFight.begin(
      land,
      { x: brig.x, y: brig.y, heading: brig.heading },
      this.ambushers,
      { sails: shipSails('sloop'), marks },
      now,
    ).then(
      (fight) => {
        if (this.done) {
          void fight.end();
          return;
        }
        this.fight = fight;
        stage.parts.objective.show('Engage', 'Sink the ships closing on you.', 8);
      },
      (error: unknown) => (this.failure = error),
    );
  }

  /** The fight's keys while it is on: the helm's, the sails', the brace. */
  key(key: string, down: boolean): boolean {
    return this.fight?.key(key, down) ?? false;
  }

  get fighting(): StoryFight | null {
    return this.done ? null : this.fight;
  }

  private cry(happening: keyof typeof CRY_GAP_S, scene: string): void {
    const last = this.cried.get(happening) ?? -Infinity;
    if (this.clock - last < CRY_GAP_S[happening]) return;
    this.cried.set(happening, this.clock);
    void this.story.stage.play(scene);
  }

  frame(tick: Tick): StoryFrame | null {
    const { story } = this;
    const { stage, brig, lightning } = story;
    if (this.failure !== null) throw this.failure;
    if (!this.begun) this.begin(tick.clock);
    this.clock += tick.seconds;
    const strike = lightning.step(tick.seconds, [brig.x, brig.y]);
    stage.stepWeather(tick.seconds, strike.flash, strike.bolt);
    const fight = this.fight;
    if (!fight) return null;
    const shown = fight.frame({ seconds: tick.seconds, time: tick.clock, far: FAR_M, swell: stage.swell() });
    this.last = shown;
    for (const happening of shown.happened) {
      if (happening === 'hit-taken') this.cry('hit-taken', 'hitTaken');
      else if (happening === 'hit-given') this.cry('hit-given', 'hitGiven');
      else if (happening === 'sinking') this.cry('sinking', 'sinking');
    }
    const ships: ShipDraw[] = shown.ships
      .filter((ship) => !ship.sunk)
      .map((ship) => ({
        hull: ship.hull === 'own' ? 'brig' : 'sloop',
        place: ship.place,
        shade: ship.shade,
        rig: ship.rig,
      }));
    const own = shown.ships[0]?.place;
    if (own) Object.assign(brig, { x: own.x, y: own.y, heading: own.heading });
    const { hud } = stage.parts;
    hud.hints([shipsLeft(shown.left, shown.ships.length - 1), ...shown.lines, ...HINTS.fight]);
    const { eye, yaw, pitch, fov } = shown.shot;
    hud.shipBars(shown.bars, poseOf({ eye: [...eye], forward: forwardOf(yaw, -pitch) }, fov));
    if (shown.over) this.finish();
    return {
      shot: shown.shot,
      ships,
      hulls: shown.hulls,
      actors: own ? [...brig.crew(own, tick.clock, { gunner: 'chop' }), youAtHelm(story, own, 'guard')] : [],
      heads: own ? brig.heads(own) : undefined,
      drawers: [{ drawInto: (pass, fromEye, drawn, time) => fight.draw(pass, { fromEye, eye: drawn.eye }, time) }],
      land: false,
      focus: [brig.x, brig.y],
    };
  }

  /** The beaten captains' Sloops where the fight left them, for the calm; none known if the fight never began. */
  get wrecks(): Sailed[] | null {
    return this.last ? wrecksOf(this.last) : null;
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    const { hud, objective } = this.story.stage.parts;
    objective.clear();
    hud.hints([]);
    hud.shipBars([], poseOf({ eye: [0, 0, 0], forward: [0, 1, 0] }, 1));
    void this.fight?.end();
  }

  leave(): void {
    this.finish();
  }
}
