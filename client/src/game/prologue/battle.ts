// The owner's fifth beat, played: the ships that came out of the dark are fought with the sea's own fight (its
// camera, its aim and its guns), the Brig drawn as the player's with its crew at work, the crew crying out as it is
// struck, as its balls strike home and as each ship goes down; it ends once every one is beaten, sunk or struck. The
// tracker says their crews are the mark, as the rules strike a ship whose men are gone, and counts the ships and men
// left.
import { forwardOf, poseOf } from '../../overworld/overworldCamera.ts';
import { shipSails } from '../../ships/shipMesh.ts';
import { onScreen, type Shot } from '../camera.ts';
import { HINTS } from '../hints.ts';
import { seaFightQuest } from '../seaPanel.ts';
import type { Beat, Tick } from './beat.ts';
import { type Ambusher, type Going, type Happening, StoryFight, type StoryFightFrame } from './fightAtSea.ts';
import { youAtHelm } from './helm.ts';
import { SKY_NOW } from '../../sky/skyDriver.ts';
import type { Hearing } from '../audio/music/directorLaw.ts';
import { hearSea, heardSky } from '../audio/music/hearing.ts';
import { fought, sung } from './music.ts';
import type { Founder, Sailed, ShipDraw } from './sailing.ts';
import { INBOUND_WAY_M_S, STORM_SOUND } from './sighted.ts';
import { STORM } from './skies.ts';
import { QUEST } from './lessons.ts';
import { headOnView, type StoryFrame } from './stage.ts';
import type { Story } from './story.ts';

/** What the crew cry out at, the scene each cries, and the fewest seconds between two cries of one kind, so a hail of
 *  hits is not a hail of words. */
type Cry = Exclude<Happening, 'sunk'>;
const CRY_SCENES: Readonly<Record<Cry, string>> = {
  'hit-taken': 'hitTaken',
  'hit-given': 'hitGiven',
  sinking: 'sinking',
};
const CRY_GAP_S: Readonly<Record<Cry, number>> = { 'hit-taken': 7, 'hit-given': 9, sinking: 3 };
/** How long a cry waits for its speaker to come on the view (the player aiming out over its side) before it is let go:
 *  later, it would answer nothing still in the picture. */
const CRY_HELD_S = 2.5;
const FAR_M = 30_000;
/** A beaten captain's Sloop is drawn as dark as the fight drew it. */
const WRECK_SHADE = 0.55;

/** The ships the sighted beat showed, as the fight takes them up: each one's bearing off the bow and distance. */
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
      way: ship.underWay ? INBOUND_WAY_M_S : 0,
    };
  });
}

type View = { readonly width: number; readonly height: number };

/** A beaten Sloop as the fight left it: where it lies, its founder, and how it goes on under if it is going. */
export interface Wreck {
  readonly ship: Sailed;
  readonly going: Going | null;
}

/** A beaten Sloop lying where it is, struck, as a story begun after the fight lays it. */
export function asWreck(
  ship: { readonly x: number; readonly y: number; readonly heading: number },
  index: number,
): Wreck {
  const { x, y, heading } = ship;
  const lying: Sailed = { who: `wreck-${index}`, hull: 'sloop', x, y, heading, underWay: false, shade: WRECK_SHADE };
  return { ship: { ...lying, founder: [0, 0, 0] }, going: null };
}

/** The beaten captains' Sloops where the fight left them, in its own pose: struck ones lying still, ones going down
 *  with what the rules last sent of how they go on under. The sunk are gone. */
export function wrecksOf(frame: StoryFightFrame | null): Wreck[] {
  return (frame?.ships ?? []).flatMap((ship, index) => {
    if (ship.hull !== 'captain' || (ship.state !== 'struck' && ship.state !== 'sinking')) return [];
    const wreck = asWreck(ship.place, index);
    return [{ ship: { ...wreck.ship, founder: ship.founder }, going: ship.state === 'sinking' ? ship.going : null }];
  });
}

/** `wreck` `seconds` on: one going down settles, trims and lists on from where it was toward how it will lie once
 *  sunk, deeper ever faster, as the rules sink it; it is gone (null) once under. A struck one lies as it was. */
export function settledOn(wreck: Wreck, seconds: number): Wreck | null {
  const { going } = wreck;
  if (!going) return wreck;
  if (seconds >= going.inS) return null;
  const [settled, trim, list] = wreck.ship.founder ?? [0, 0, 0];
  const [under, sunkTrim, sunkList] = going.sunk;
  const along = seconds / going.inS;
  // The rules settle it by the square of its share of the way down: the share now, then as far again on.
  const from = under > 0 ? Math.min(1, Math.sqrt(Math.max(0, settled) / under)) : 1;
  const share = from + (1 - from) * along;
  const deeper = from < 1 ? (share * share - from * from) / (1 - from * from) : along;
  const founder: Founder = [
    settled + (under - settled) * deeper,
    trim + (sunkTrim - trim) * along,
    list + (sunkList - list) * along,
  ];
  return { ship: { ...wreck.ship, founder }, going: { sunk: going.sunk, inS: going.inS - seconds } };
}

/** Every wreck `seconds` on that is still above water. */
export function wrecksOn(wrecks: readonly Wreck[], seconds: number): Wreck[] {
  return wrecks.flatMap((wreck) => settledOn(wreck, seconds) ?? []);
}

export class Battle implements Beat {
  readonly name = 'battle';
  readonly skippable = false;
  private readonly story: Story;
  private readonly inbound: readonly Sailed[];
  private readonly ambushers: readonly Ambusher[];
  /** Its way as the fight takes it up, m/s. */
  private readonly way: number;
  private fight: StoryFight | null = null;
  private begun = false;
  /** Why the fight could not begin, thrown from the next frame for the director to go on past it. */
  private failure: unknown = null;
  private last: StoryFightFrame | null = null;
  private readonly cried = new Map<Cry, number>();
  /** Each cry waiting for its speaker to come on the view, and when what it answers happened. */
  private readonly waiting = new Map<Cry, number>();
  private clock = 0;
  done = false;

  constructor(story: Story, inbound: readonly Sailed[]) {
    this.story = story;
    this.inbound = inbound;
    this.ambushers = ambushersFrom(story, inbound);
    const { brig, stage } = story;
    stage.weatherTowards(STORM, 2);
    stage.parts.ambience.set(STORM_SOUND, 1.5);
    story.lightning.striking = true;
    this.way = brig.way;
    brig.way = 0;
  }

  /** The fight begun on the story's clock, so its first words ("... sighted") stand a while, every ship under the
   *  sail and way it was last drawn with. */
  private begin(now: number): void {
    this.begun = true;
    const { brig, land, marks, stage, sailing } = this.story;
    const wind = stage.windBearing();
    const rigs = {
      own: sailing.rigOf({ ...brig.sailed(), underWay: this.way > 0 }, wind, now),
      captains: this.inbound.map((ship) => sailing.rigOf(ship, wind, now)),
    };
    StoryFight.begin(
      land,
      { x: brig.x, y: brig.y, heading: brig.heading, way: this.way },
      this.ambushers,
      { sails: shipSails('sloop'), marks },
      now,
      () => stage.wind(),
      rigs,
    ).then(
      (fight) => {
        if (this.done) {
          void fight.end();
          return;
        }
        this.fight = fight;
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

  /** A cry the crew have to make, unless one of its kind was made a moment ago. */
  private cry(happening: Cry): void {
    const last = this.cried.get(happening) ?? -Infinity;
    if (this.clock - last < CRY_GAP_S[happening]) return;
    this.waiting.set(happening, this.clock);
  }

  /** Each waiting cry said once its speaker's head is on the view, so its words are heard; one whose moment has
   *  passed unseen is let go, and no gap is spent on it. */
  private sayCries(shot: Shot, heads: ReadonlyMap<string, readonly [number, number, number]>, view: View): void {
    const { stage } = this.story;
    for (const [happening, since] of this.waiting) {
      const scene = CRY_SCENES[happening];
      const who = stage.parts.scenes[scene]?.[0]?.who;
      const head = who === undefined ? undefined : heads.get(who);
      if (head && headOnView(onScreen(shot, view, head), view)) {
        this.waiting.delete(happening);
        this.cried.set(happening, this.clock);
        void stage.play(scene);
      } else if (this.clock - since > CRY_HELD_S) this.waiting.delete(happening);
    }
  }

  /** Before the fight begins, the storm whole; once it is on, the sea's own fight song, as any fight at sea plays. */
  music(): Hearing {
    const fight = this.fight;
    if (!fight) return sung('storm', 'peak');
    const { brig } = this.story;
    const sea = { position: [brig.x, brig.y] as const, sighted: null, fight: fight.sides };
    return fought(hearSea(sea, heardSky(SKY_NOW.current.reading)), null, 'silent');
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
    for (const happening of shown.happened) if (happening !== 'sunk') this.cry(happening);
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
    const heads = own ? brig.heads(own) : undefined;
    if (heads) this.sayCries(shown.shot, heads, tick.viewport);
    const { hud } = stage.parts;
    hud.hints(HINTS.fight);
    hud.seaFight(shown.over ? null : shown.display);
    hud.tasks.show(seaFightQuest(QUEST, shown.readout.left, shown.readout.men));
    hud.toast(...shown.readout.said);
    const { eye, yaw, pitch, fov } = shown.shot;
    hud.shipBars(shown.bars, poseOf({ eye: [...eye], forward: forwardOf(yaw, -pitch) }, fov));
    if (shown.over) this.finish();
    return {
      shot: shown.shot,
      ships,
      hulls: shown.hulls,
      actors: own ? [...brig.crew(own, tick.clock, { gunner: 'chop' }), youAtHelm(story, own, 'idle')] : [],
      heads,
      // The balls and effects with the ships; the aim and the see-through puffs after the water, as at sea.
      drawers: [
        {
          drawInto: (pass, fromEye, drawn, time) => fight.draw(pass, { fromEye, eye: drawn.eye }, time),
          overWater: (encoder, target, fromEye, depth) => fight.overWater(encoder, target, fromEye, depth),
          lightInto: (pass) => fight.lightInto(pass),
        },
      ],
      land: false,
      heard: { at: 'sea', deck: false, sailing: true, fight: fight.fightHeard },
      focus: [brig.x, brig.y],
    };
  }

  /** The beaten captains' Sloops where the fight left them, for the calm; none known if the fight never began. */
  get wrecks(): Wreck[] | null {
    return this.last ? wrecksOf(this.last) : null;
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    const { hud } = this.story.stage.parts;
    hud.tasks.show(null);
    hud.seaFight(null);
    hud.toast();
    hud.hints([]);
    hud.seaFight(null);
    hud.shipBars([], poseOf({ eye: [0, 0, 0], forward: [0, 1, 0] }, 1));
    // The calm draws its sails, and each wreck's, on from where the fight left them.
    const { sailing } = this.story;
    this.last?.ships.forEach((ship, index) => sailing.keep(index === 0 ? 'brig' : `wreck-${index}`, ship.rig));
    void this.fight?.end();
  }

  leave(): void {
    this.finish();
  }
}
