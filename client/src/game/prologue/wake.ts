// The owner's eighth beat: in first person, flat on the deck, the eyes blinking, the view swimming, the ears ringing;
// rising to the feet and looking round at two ships jammed into one and burning; then the camera pulls back out of the
// eyes and rushes the length of the wreck, past its boarders fighting the Brig's crew, to the arena at its end, and
// comes back over the player's shoulder, where their control begins.
import { Cues } from '../../cinema/cues.ts';
import { type Point3, type RailKey, railShot } from '../../cinema/rail.ts';
import type { FoeType } from '../../rules/roster.ts';
import { frameOf, onScreen, type Shot } from '../camera.ts';
import type { Actor } from './actors.ts';
import type { Beat, Tick } from './beat.ts';
import { type Pairing, fighters } from './fighters.ts';
import { YOU_ID } from './helm.ts';
import type { Hearing } from '../audio/music/directorLaw.ts';
import { fought, hushed } from './music.ts';
import { headOnView, type StoryFrame } from './stage.ts';
import type { Story } from './story.ts';
import { CREW_TYPES } from './wreckCrew.ts';
import { titheCrew, topAt, type WreckLayout } from './wreckLayout.ts';
import type { WreckRun } from './wreckRun.ts';
import { setAblaze, type WreckScenery } from './wreckScenery.ts';
import { blurAt, lidsAt, lightAt, OPEN_S } from './waking.ts';

const LENS = { fov: 1.0, near: 0.05, far: 20_000 } as const;
/** When the eyes are open for good, when the player stands, when the camera leaves the eyes, and when control comes. */
const STAND_S = 10.5;
const LEAVE_S = 13;
const CONTROL_S = 36;
/** The flight down the wreck: when it sets off, after the shot over the shoulder, and how long it takes, about 10 m a
 *  second along the path; how high over the deck it flies and how far ahead along the path it looks, metres. */
const DOWN_S = LEAVE_S + 3;
const DOWN_FOR_S = 13;
const OVER_DECK_M = 7;
const LOOK_AHEAD_M = 12;
/** The flight's points along the path stand this far apart, metres. */
const PATH_STEP_M = 4;
/** Each leg of the way back to the player, seconds. */
const BACK_LEG_S = 2;
/** How far the flight's eye keeps from a mast still standing, metres. */
const MAST_CLEAR_M = 3.5;
/** The fights the camera passes: in each zone, each Grey Tithe boarder against one of the Brig's crew, the two
 *  standing where it and the pirate beside it are posted. The boarders are one side, as they fight. */
export function stagedFights(layout: WreckLayout, roster: readonly FoeType[]): Pairing[] {
  const pairs: Pairing[] = [];
  const drawn = (type: number | undefined) => roster.some((each) => each.type === type);
  for (const zone of layout.zones.slice(0, layout.arena.zone)) {
    const tithes = zone.wave.filter((foe) => titheCrew(foe.type));
    const pirates = zone.wave.filter((foe) => !titheCrew(foe.type));
    tithes.forEach((foe, index) => {
      const pirate = pirates[index];
      const crew = CREW_TYPES[pairs.length % CREW_TYPES.length];
      if (!pirate || crew === undefined || !drawn(foe.type) || !drawn(crew)) return;
      const [x, y] = [(foe.at[0] + pirate.at[0]) / 2, (foe.at[1] + pirate.at[1]) / 2];
      const facing = Math.atan2(pirate.at[0] - foe.at[0], foe.at[1] - pirate.at[1]);
      pairs.push({ first: foe.type, second: crew, at: [x, y, topAt(layout.course, x, y)], facing });
    });
  }
  return pairs;
}

/** The points over each staged fighter's head, by pair: 'fight-<pair>-tithe' and 'fight-<pair>-crew'. */
export function pairHeads(pairs: readonly Pairing[]): Map<string, readonly [number, number, number]> {
  const heads = new Map<string, readonly [number, number, number]>();
  pairs.forEach((pair, index) => {
    const [east, south] = [Math.sin(pair.facing) * 0.9, -Math.cos(pair.facing) * 0.9];
    const [x, y, z] = pair.at;
    heads.set(`fight-${index}-tithe`, [x - east, y - south, z + 2.1]);
    heads.set(`fight-${index}-crew`, [x + east, y + south, z + 2.1]);
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
  /** How long the heart has beaten, seconds: on with the wake, never held while the wreck comes. */
  private heart = 0;
  done = false;

  constructor(story: Story, layout: WreckLayout, scenery: WreckScenery, run: Promise<WreckRun>) {
    this.story = story;
    this.layout = layout;
    this.scenery = scenery;
    const { stage } = story;
    const { ambience, screen } = stage.parts;
    setAblaze(story, layout);
    ambience.heartbeat(true);
    screen.bars(false);
    screen.lids(1, lightAt(0));
    screen.blur(blurAt(0, 0));
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
    // Each point is flown to by how far along the path it lies, so the flight keeps one pace down the wreck.
    const walked = path.map((unused, index) =>
      path.slice(1, index + 1).reduce((sum, [x, y], step) => {
        const [fromX, fromY] = path[step] ?? [x, y];
        return sum + Math.hypot(x - fromX, y - fromY);
      }, 0),
    );
    const length = Math.max(1e-6, walked.at(-1) ?? 0);
    // The point `metres` along the path, its last past its end, so the look turns as the path does, not at each point.
    const onPath = (metres: number): readonly [number, number] => {
      const index = walked.findIndex((reached) => reached >= metres);
      if (index <= 0) return path[index === 0 ? 0 : path.length - 1] ?? [0, 0];
      const [from, to] = [path[index - 1] ?? [0, 0], path[index] ?? [0, 0]];
      const share =
        (metres - (walked[index - 1] ?? 0)) / Math.max(1e-6, (walked[index] ?? 0) - (walked[index - 1] ?? 0));
      return [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share];
    };
    // Flown through points an even step apart along the path, so the flight keeps one pace down the wreck.
    const steps = Math.max(1, Math.ceil(length / PATH_STEP_M));
    const along = Array.from({ length: steps + 1 }, (unused, step): RailKey => {
      const metres = (length * step) / steps;
      const [x, y] = onPath(metres);
      const [east, south] = this.clearOfMasts(x, y);
      const [lookX, lookY] = onPath(metres + LOOK_AHEAD_M);
      return {
        at: DOWN_S + (metres / length) * DOWN_FOR_S,
        eye: [x + east, y + south, topAt(this.layout.course, x, y) + OVER_DECK_M],
        look: [lookX, lookY, topAt(this.layout.course, lookX, lookY) + 1.5],
      };
    });
    const back = rest ? restingKey(rest) : { eye: behind, look: ahead(stand), fov: 0.9 };
    // Back to the player out past the Frigate's side and the Brig's broken stern, clear of the masts still standing.
    const [first, second] = this.layout.flightBack.map((eye): Omit<RailKey, 'at'> => ({ eye, look: stand }));
    return [
      // Held a moment in the eyes, so the camera eases out of them.
      { at: LEAVE_S, eye: stand, look: ahead(stand), fov: LENS.fov },
      { at: LEAVE_S + 0.3, eye: stand, look: ahead(stand), fov: LENS.fov },
      { at: LEAVE_S + 2, eye: behind, look: ahead(stand), fov: 0.9 },
      ...along,
      ...(first && second
        ? [
            { at: CONTROL_S - 1.5 - BACK_LEG_S * 2, ...first },
            { at: CONTROL_S - 1.5 - BACK_LEG_S, ...second },
          ]
        : []),
      { at: CONTROL_S - 1.5, ...back },
      { at: CONTROL_S, ...back },
    ];
  }

  /** How far to stand off from a point of the path as the flight passes over it: straight away from each mast still
   *  standing nearer than `MAST_CLEAR_M`, out to that distance, so passing a mast the eye leans away from it and back,
   *  on the side the path passes it. */
  private clearOfMasts(x: number, y: number): readonly [number, number] {
    let [east, south] = [0, 0];
    for (const [mastX, mastY] of this.layout.masts) {
      const [away, aside] = [x - mastX, y - mastY];
      const apart = Math.hypot(away, aside);
      if (apart >= MAST_CLEAR_M) continue;
      // A point on the mast itself stands off to the east.
      const [outX, outY] = apart > 1e-6 ? [away / apart, aside / apart] : [1, 0];
      east += outX * (MAST_CLEAR_M - apart);
      south += outY * (MAST_CLEAR_M - apart);
    }
    return [east, south];
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

  /** Nothing over the ringing and the heart; then, as the camera rushes the wreck, the Boarding's first part, tense. */
  music(): Hearing {
    return this.since >= LEAVE_S ? fought(null, 'boarding', 'tension') : hushed(true);
  }

  frame(tick: Tick): StoryFrame {
    const { stage } = this.story;
    // The eyes stay shut until the wreck they open on has come.
    if (!(this.scenery.coming && this.since >= OPEN_S - 1)) this.since += tick.seconds;
    this.heart += tick.seconds;
    this.cues.step(this.since);
    stage.stepWeather(tick.seconds);
    const { screen } = stage.parts;
    screen.lids(lidsAt(this.since), lightAt(this.heart));
    screen.blur(blurAt(this.since, this.heart));
    if (this.since >= CONTROL_S) this.done = true;
    const shot = this.shotAt(this.since);
    const flying = this.since >= LEAVE_S;
    const actors: Actor[] = flying ? fighters(stage.parts.roster, this.pairs, tick.clock) : [];
    if (this.thirdPerson) actors.push(this.you());
    if (flying) this.cry(tick.viewport);
    return {
      shot,
      actors,
      drawers: [this.scenery.drawer],
      hulls: this.scenery.hulls,
      heads: this.heads,
      focus: [shot.eye[0], shot.eye[1]],
      heard: { at: 'sea', deck: true, sailing: false },
    };
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
        (time) => seen(`fight-${index}-tithe`, time) && seen(`fight-${index}-crew`, time),
      ),
    );
    if (pair < 0) return;
    this.cried = true;
    void this.story.stage.play('wreck', true, { tithe: `fight-${pair}-tithe`, crew: `fight-${pair}-crew` });
  }

  /** Whether the player's own figure shows: once the camera has left their eyes. */
  get thirdPerson(): boolean {
    return this.since >= LEAVE_S + 0.6;
  }

  private shotAt(since: number): Shot {
    const facing = this.layout.wake.facing;
    if (since >= LEAVE_S) return { ...LENS, ...railShot(this.flight, since, LENS.fov, 'none') };
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
