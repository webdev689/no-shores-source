// The owner's fifth beat, played: the ships that came out of the dark are fought with the sea's own fight (its
// camera, its aim and its guns), the Brig drawn as hers with her crew at work, the crew crying out as she is struck,
// as her balls strike home and as each ship goes down; it ends when every one has sunk.
import { forwardOf, poseOf } from '../../overworld/overworldCamera.ts';
import { HINTS } from '../hints.ts';
import type { Beat, Tick } from './beat.ts';
import { type Ambusher, StoryFight, type StoryFightFrame } from './fightAtSea.ts';
import { youAtHelm } from './helm.ts';
import { storyCue } from './music.ts';
import type { ShipDraw } from './sailing.ts';
import type { StoryFrame } from './stage.ts';
import type { Story } from './story.ts';
import type { Sailed } from './sailing.ts';

/** The fewest seconds between two of the crew's cries of one kind, so a hail of hits is not a hail of words. */
const CRY_GAP_S = { 'hit-taken': 7, 'hit-given': 9, sinking: 3 } as const;
const FAR_M = 30_000;

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

export class Battle implements Beat {
  readonly name = 'battle';
  readonly skippable = false;
  private readonly story: Story;
  private fight: StoryFight | null = null;
  private last: StoryFightFrame | null = null;
  private readonly cried = new Map<string, number>();
  private clock = 0;
  done = false;

  constructor(story: Story, inbound: readonly Sailed[]) {
    this.story = story;
    storyCue('battle');
    const { brig, land, marks, stage } = story;
    story.lightning.on = true;
    brig.way = 0;
    void StoryFight.begin(land, { x: brig.x, y: brig.y, heading: brig.heading }, ambushersFrom(story, inbound), { sails: [], marks }, 0).then(
      (fight) => {
        this.fight = fight;
        stage.parts.objective.show('Engage', 'Sink the ships closing on you.', 8);
      },
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
      .map((ship) => ({ hull: ship.hull === 'own' ? 'brig' : 'sloop', place: ship.place, shade: ship.shade, rig: ship.rig }));
    const own = shown.ships[0]?.place;
    if (own) Object.assign(brig, { x: own.x, y: own.y, heading: own.heading });
    const { hud } = stage.parts;
    hud.hints([...shown.lines, ...HINTS.fight]);
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

  /** Where the fight left her, and the captains' wrecks going down. */
  get lastFrame(): StoryFightFrame | null {
    return this.last;
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
