// The owner's eighth beat: in first person, flat on the deck, the eyes blinking, the view swimming, the ears ringing;
// rising to the feet and looking round at two ships jammed into one and burning; then the camera pulls back out of the
// eyes and rushes the length of the wreck, past its factions fighting each other, to the arena at its end, and comes
// back over the player's shoulder, where their control begins.
import { Cues } from '../../cinema/cues.ts';
import { type Point3, type RailKey, railShot } from '../../cinema/rail.ts';
import type { FoeType } from '../../rules/roster.ts';
import { frameOf, onScreen, type Shot } from '../camera.ts';
import type { Actor } from './actors.ts';
import type { Beat, Tick } from './beat.ts';
import { type Pairing, fighters } from './fighters.ts';
import { YOU_ID } from './helm.ts';
import { storyCue } from './music.ts';
import { headOnView, type StoryFrame } from './stage.ts';
import type { Story } from './story.ts';
import { titheCrew, topAt, type WreckLayout } from './wreckLayout.ts';
import type { WreckRun } from './wreckRun.ts';
import { setAblaze, type WreckScenery } from './wreckScenery.ts';

const LENS = { fov: 1.0, near: 0.05, far: 20_000 } as const;
/** When the eyes are open for good, when the player stands, when the camera leaves the eyes, and when control comes. */
const OPEN_S = 6.5;
const STAND_S = 10.5;
const LEAVE_S = 13;
const CONTROL_S = 25;
/** How far the flight's eye keeps from a mast still standing, metres. */
const MAST_CLEAR_M = 2.5;
/** The lids' shut share over the first seconds, a slow blinking awake: [seconds, shut]. */
const BLINKS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1.1, 0.45],
  [1.9, 1],
  [3.1, 0.25],
  [3.7, 0.85],
  [5.2, 0.05],
  [OPEN_S, 0],
];

/** The lids' shut share at `time`, eased between the blinks. */
export function lidsAt(time: number): number {
  for (let index = 1; index < BLINKS.length; index++) {
    const [after, shut] = BLINKS[index] ?? [0, 0];
    const [before, was] = BLINKS[index - 1] ?? [0, 0];
    if (time <= after) {
      const share = Math.min(1, Math.max(0, (time - before) / (after - before)));
      return was + (shut - was) * share * share * (3 - 2 * share);
    }
  }
  return 0;
}

/** The fights the camera passes: in each zone, each Grey Tithe foe paired with a pirate beside them. */
export function stagedFights(layout: WreckLayout, roster: readonly FoeType[]): Pairing[] {
  const pairs: Pairing[] = [];
  for (const zone of layout.zones.slice(0, layout.arena.zone)) {
    const tithes = zone.wave.filter((foe) => titheCrew(foe.type));
    const pirates = zone.wave.filter((foe) => !titheCrew(foe.type));
    tithes.forEach((foe, index) => {
      const pirate = pirates[index];
      if (!pirate || !roster.some((each) => each.type === foe.type)) return;
      const [x, y] = [(foe.at[0] + pirate.at[0]) / 2, (foe.at[1] + pirate.at[1]) / 2];
      const facing = Math.atan2(pirate.at[0] - foe.at[0], foe.at[1] - pirate.at[1]);
      pairs.push({ first: foe.type, second: pirate.type, at: [x, y, topAt(layout.course, x, y)], facing });
    });
  }
  return pairs;
}

/** The points over each staged fighter's head, by pair: 'fight-<pair>-tithe' and 'fight-<pair>-pirate'. */
export function pairHeads(pairs: readonly Pairing[]): Map<string, readonly [number, number, number]> {
  const heads = new Map<string, readonly [number, number, number]>();
  pairs.forEach((pair, index) => {
    const [east, south] = [Math.sin(pair.facing) * 0.9, -Math.cos(pair.facing) * 0.9];
    const [x, y, z] = pair.at;
    heads.set(`fight-${index}-tithe`, [x - east, y - south, z + 2.1]);
    heads.set(`fight-${index}-pirate`, [x + east, y + south, z + 2.1]);
  });
  return heads;
}

/** A shot as a camera rail's key: its eye, a point ahead along its look, and its lens. */
function restingKey(shot: Shot): Pick<RailKey, 'eye' | 'look' | 'fov'> {
  const [east, south, up] = frameOf(shot).forward;
  const [x, y, z] = shot.eye;
  return { eye: [x, y, z], look: [x + east * 10, y + south * 10, z + up * 10], fov: shot.fov };
}

/** How long a pair must stay on the view to be heard crying out to each other, seconds. */
const HEARD_S = 2.4;

export class Wake implements Beat {
  readonly name = 'wake';
  readonly skippable = true;
  private readonly story: Story;
  private readonly layout: WreckLayout;
  private readonly scenery: WreckScenery;
  private readonly cues: Cues;
  private flight: RailKey[];
  private readonly pairs: Pairing[];
  private readonly heads: ReadonlyMap<string, readonly [number, number, number]>;
  /** Whether a staged pair has cried out to each other. */
  private cried = false;
  private since = 0;
  done = false;

  constructor(story: Story, layout: WreckLayout, scenery: WreckScenery, run: Promise<WreckRun>) {
    this.story = story;
    this.layout = layout;
    this.scenery = scenery;
    const { stage } = story;
    const { ambience, screen } = stage.parts;
    storyCue('wreck');
    setAblaze(story, layout);
    ambience.heartbeat(true);
    screen.bars(false);
    screen.lids(1);
    screen.blur(9);
    screen.fade(0, 1.4);
    this.pairs = stagedFights(layout, stage.parts.roster);
    this.heads = pairHeads(this.pairs);
    this.flight = this.flightKeys(null);
    // The flight ends where the run's own camera takes the player standing, so play begins without a cut; a run that
    // fails to open is the fight's to tell.
    void run.then(
      (opened) => (this.flight = this.flightKeys(opened.restingShot())),
      () => undefined,
    );
    this.cues = new Cues([
      [0.4, () => ambience.thud()],
      [STAND_S, () => ambience.heartbeat(false)],
      [LEAVE_S + 0.2, () => ambience.whoosh()],
    ]);
  }

  /** The player's eye on the deck where they woke: lying, sitting, standing. */
  private eyeAt(height: number): Point3 {
    const [x, y] = this.layout.wake.at;
    return [x, y, topAt(this.layout.course, x, y) + height];
  }

  /** Out of the eyes and back over the player's shoulder, then the length of the wreck along its path to the arena's
   *  gate, and back over the player's shoulder to `rest`, the shot play begins from (until the run opens, a shot
   *  behind them). */
  private flightKeys(rest: Shot | null): RailKey[] {
    const facing = this.layout.wake.facing;
    const stand = this.eyeAt(1.65);
    // Over the right shoulder, up and to the side, so the player's head stands clear of the middle of the picture.
    const right = facing + Math.PI / 2;
    const behind: Point3 = [
      stand[0] - Math.sin(facing) * 3.6 + Math.sin(right) * 0.9,
      stand[1] + Math.cos(facing) * 3.6 - Math.cos(right) * 0.9,
      stand[2] + 0.9,
    ];
    const ahead = (from: Point3): Point3 => [
      from[0] + Math.sin(facing) * 20,
      from[1] - Math.cos(facing) * 20,
      from[2] - 2,
    ];
    // The path ends at Thule's place, in the arena: the flight stops at its gate, so he is first seen in the push in.
    const path = this.layout.path.slice(0, -1);
    const along = path.map(([x, y], index): RailKey => {
      const next = path[Math.min(path.length - 1, index + 1)] ?? [x, y];
      const deck = topAt(this.layout.course, x, y);
      const [east, south] = this.clearOfMasts(x, y);
      return {
        at: LEAVE_S + 2 + (index / Math.max(1, path.length - 1)) * 6,
        eye: [x + east, y + south, deck + 5.5],
        look: [next[0] + (next[0] - x) * 2, next[1] + (next[1] - y) * 2, deck + 1.5],
      };
    });
    const back = rest ? restingKey(rest) : { eye: behind, look: ahead(stand), fov: 0.9 };
    // Back to the player out past the Frigate's side and the Brig's broken stern, clear of the masts still standing.
    const [first, second] = this.layout.flightBack.map((eye): Omit<RailKey, 'at'> => ({ eye, look: stand }));
    return [
      { at: LEAVE_S, eye: stand, look: ahead(stand), fov: LENS.fov },
      { at: LEAVE_S + 1.4, eye: behind, look: ahead(stand), fov: 0.9 },
      ...along,
      ...(first && second
        ? [
            { at: CONTROL_S - 3.2, ...first },
            { at: CONTROL_S - 2.4, ...second },
          ]
        : []),
      { at: CONTROL_S - 1.6, ...back },
      { at: CONTROL_S, ...back },
    ];
  }

  /** Which way to stand off from a point of the path as the flight passes over it: behind it and to one side, the
   *  side whose eye stands furthest from every mast still standing, as a metre and a half each way. */
  private clearOfMasts(x: number, y: number): readonly [number, number] {
    const sides = [
      [1.5, -1.5],
      [-1.5, -1.5],
      [1.5, 1.5],
      [-1.5, 1.5],
    ] as const;
    const nearest = ([east, south]: readonly [number, number]) =>
      Math.min(...this.layout.masts.map(([mastX, mastY]) => Math.hypot(x + east - mastX, y + south - mastY)));
    return (
      sides.find((side) => nearest(side) >= MAST_CLEAR_M) ??
      sides.reduce((best, side) => (nearest(side) > nearest(best) ? side : best))
    );
  }

  skip(): void {
    this.cues.finish();
    const { screen } = this.story.stage.parts;
    screen.lids(0);
    screen.blur(0);
    // The director frames a beat once more after its skip: that frame is the flight's last, eyes open.
    this.since = CONTROL_S;
    this.cried = true;
    this.done = true;
  }

  frame(tick: Tick): StoryFrame {
    const { stage } = this.story;
    // The eyes stay shut until the wreck they open on has come.
    if (!(this.scenery.coming && this.since >= OPEN_S - 1)) this.since += tick.seconds;
    this.cues.step(this.since);
    stage.stepWeather(tick.seconds);
    const { screen } = stage.parts;
    screen.lids(lidsAt(this.since));
    screen.blur(Math.max(0, 9 * (1 - this.since / (OPEN_S + 1))));
    if (this.since >= CONTROL_S) this.done = true;
    const shot = this.shotAt(this.since);
    const flying = this.since >= LEAVE_S;
    const actors: Actor[] = flying ? fighters(stage.parts.roster, this.pairs, tick.clock) : [];
    if (this.thirdPerson) actors.push(this.you());
    if (flying) this.cry(tick.viewport);
    return { shot, actors, drawers: [this.scenery.drawer], heads: this.heads, focus: [shot.eye[0], shot.eye[1]] };
  }

  /** The player standing where they woke, as the flight sees them from outside their eyes. */
  private you(): Actor {
    const [x, y] = this.layout.wake.at;
    const { facing } = this.layout.wake;
    const z = topAt(this.layout.course, x, y);
    return { id: YOU_ID, dress: this.story.dress, anim: 'idle', x, y, z, facing };
  }

  /** The first staged pair the flight holds on the view long enough to cry out to each other there, once. */
  private cry(view: { readonly width: number; readonly height: number }): void {
    if (this.cried || this.since > CONTROL_S - HEARD_S) return;
    const seen = (name: string, time: number) => {
      const point = this.heads.get(name);
      return !!point && !!headOnView(onScreen(this.shotAt(time), view, point), view);
    };
    const pair = this.pairs.findIndex((unused, index) =>
      [this.since, this.since + HEARD_S].every(
        (time) => seen(`fight-${index}-tithe`, time) && seen(`fight-${index}-pirate`, time),
      ),
    );
    if (pair < 0) return;
    this.cried = true;
    void this.story.stage.play('wreck', true, { tithe: `fight-${pair}-tithe`, pirate: `fight-${pair}-pirate` });
  }

  /** Whether the player's own figure shows: once the camera has left their eyes. */
  get thirdPerson(): boolean {
    return this.since >= LEAVE_S + 0.6;
  }

  private shotAt(since: number): Shot {
    const facing = this.layout.wake.facing;
    if (since >= LEAVE_S) return { ...LENS, ...railShot(this.flight, since, LENS.fov, 'both') };
    // Lying: looking up into the storm, the head lolling; sitting up; standing and looking round.
    const rise = Math.min(1, Math.max(0, (since - OPEN_S) / (STAND_S - OPEN_S)));
    const eased = rise * rise * (3 - 2 * rise);
    const sway = Math.sin(since * 0.9) * 0.08 * (1 - eased);
    const around = since > STAND_S ? Math.sin((since - STAND_S) * 1.6) * 0.8 : 0;
    return {
      ...LENS,
      eye: this.eyeAt(0.3 + 1.35 * eased),
      yaw: facing + sway + around,
      pitch: -1.25 * (1 - eased) + 0.12 * eased,
    };
  }
}
