// What brings foes, drawn each frame from what the room sends (crates/room/src/arrivals.rs): each Grey Tithe airship
// flying in, hanging over its ground while its foes are let down and flying on, as the props draw its Blender model
// (`tithe-airship`), its thrusters burning and its stacks smoking, a beam from its hatch to each foe it lets down;
// each Lattice crown forming in the air (`lattice-crown`), its crystal drawn in to its heart, a thread of its light
// down to each foe forming under it, then breaking in the crystal's wave, its shards falling and sinking into the
// ground. And where each is heard, from the world's own sounds.
import { type ShipPose, shipPoint, shipPose } from '../combat/airshipFlight.ts';
import {
  LOOKS,
  type Puff,
  layBeam,
  layFlame,
  layForming,
  layGathering,
  layLanding,
  layPuffs,
} from '../combat/arrivalLooks.ts';
import { CROWN, crownState } from '../combat/crownLife.ts';
import { RoomTicks } from '../combat/foeArrivals.ts';
import { latticeWaves } from '../combat/latticeLooks.ts';
import { type HeardSound, WHOLE_MOST_M } from '../combat/worldSounds.ts';
import type { EventProp } from '../city/eventProps.ts';
import { moduleNumber, moduleSocket, moduleSocketFacing } from '../city/modules.ts';
import { type ArrivalSeen, BRINGER, type FoeArrival } from '../network/arrivalMessages.ts';

type Point = readonly [number, number, number];

/** What the view reads of the fight: what brings foes, and each foe's arrival and feet. */
export interface ArrivalsFight {
  readonly roomTick: number;
  readonly arrivals: readonly ArrivalSeen[];
  readonly foes: ReadonlyMap<
    number,
    {
      readonly arrival?: FoeArrival | null;
      readonly view: { readonly x: number; readonly y: number; readonly z: number };
    }
  >;
}

/** A frame's props and sounds. */
export interface ArrivalsFrame {
  readonly props: EventProp[];
  readonly sounds: HeardSound[];
}

/** A shard of a broken crown falling to the ground and sinking into it: where it broke from, which way it flies off
 *  (m/s), how it spins and when it broke (page seconds); once it strikes the land, where it lies, how it lies and when
 *  it struck. */
interface Falling {
  readonly from: Point;
  readonly away: readonly [number, number, number];
  readonly spin: number;
  readonly broke: number;
  struck: { readonly at: Point; readonly turn: number; readonly lid: number; readonly when: number } | null;
}

/** How a broken crown's shards fall (m/s²), how long one lies before it sinks and how long it takes to sink, seconds;
 *  how many there are. Stacks smoke this often, seconds. How often a ship's fire roars, seconds; how near the ground a
 *  ship is kept on its way. */
const FALL = { gravity: 14, lies: 0.8, sinks: 0.7, shards: 7 } as const;
const SMOKE_EVERY_S = 0.14;
const ROAR_EVERY_S = 2.6;
const CLEAR_OF_GROUND_M = 12;
/** A ship or crown first seen this many ticks or more past one of its beats was come on late: that beat is not heard.
 *  A room's tick this far below the last one seen is a room joined anew, whose numbers start again. */
const LATE_TICKS = 30;
const NEW_ROOM_TICKS = 60;
/** The airship's sockets (tools/modules/airship.py): its four thrusters, its two lifts, its stacks and its hatch. */
const THRUSTS = ['thrust-1', 'thrust-2', 'thrust-3', 'thrust-4'] as const;
const LIFTS = ['lift-1', 'lift-2'] as const;
const STACKS = ['stack-1', 'stack-2'] as const;

/** The airships and crowns of the room the player stands in, drawn and heard. */
export class ArrivalsView {
  private readonly ticks = new RoomTicks();
  /** Each ship's smoke, by its number, and when it last puffed; each ship's last roar. */
  private readonly smoke = new Map<number, { puffs: Puff[]; last: number; roared: number }>();
  /** The ships and crowns already heard beginning, hanging, leaving and breaking, by their number. */
  private readonly heard = new Map<number, Set<string>>();
  /** Each foe heard let down or begun forming: what brought it, the room tick it lands and the page's second it did. */
  private readonly coming = new Map<
    number,
    { kind: number; lands: number; landed: { readonly at: Point; readonly when: number } | null }
  >();
  private falling: Falling[] = [];
  /** The numbers of the ships and crowns in this frame's word, kept from frame to frame; the room's last tick seen. */
  private readonly live = new Set<number>();
  private roomTick = -1;

  /** One frame at the page's `clock` (seconds): the props to draw and the sounds heard, the marks laid into `marks`
   *  as seen from `eye`; `ground` is the land's height, null off it. */
  frame(
    fight: ArrivalsFight,
    clock: number,
    marks: number[],
    eye: Point,
    ground: (x: number, y: number) => number | null,
  ): ArrivalsFrame {
    if (fight.roomTick + NEW_ROOM_TICKS < this.roomTick) this.clear();
    this.roomTick = fight.roomTick;
    const tick = this.ticks.now(fight.roomTick, clock);
    const props: EventProp[] = [];
    const sounds: HeardSound[] = [];
    const live = this.live;
    live.clear();
    for (const each of fight.arrivals) live.add(each.id);
    for (const id of this.smoke.keys()) if (!live.has(id)) this.smoke.delete(id);
    for (const id of this.heard.keys()) if (!live.has(id)) this.heard.delete(id);
    for (const each of fight.arrivals) {
      if (each.kind === BRINGER.airship) this.ship(each, { tick, clock, eye, ground }, { props, sounds, marks }, fight);
      else if (each.kind === BRINGER.crown) this.crown(each, { tick, clock, eye }, { props, sounds, marks }, fight);
    }
    this.foesLanding(fight, tick, clock, marks, sounds);
    if (this.falling.length > 0) this.shards(clock, ground, props);
    return { props, sounds };
  }

  /** The beats of a ship or crown already heard, by its number: first seen, those it was past LATE_TICKS or more ago
   *  (`beats`, each at its tick) are taken as heard, so a player who comes on one late hears it from where it is. */
  private beatsOf(id: number, tick: number, beats: readonly (readonly [string, number])[]): Set<string> {
    let heard = this.heard.get(id);
    if (!heard) {
      heard = new Set(beats.filter(([, when]) => tick - when >= LATE_TICKS).map(([beat]) => beat));
      this.heard.set(id, heard);
    }
    return heard;
  }

  /** An airship as it flies at `tick`: its prop, its fire and smoke, the beams it lets its foes down in, its sounds. */
  private ship(
    ship: ArrivalSeen,
    {
      tick,
      clock,
      eye,
      ground,
    }: { tick: number; clock: number; eye: Point; ground: (x: number, y: number) => number | null },
    out: { props: EventProp[]; sounds: HeardSound[]; marks: number[] },
    fight: ArrivalsFight,
  ): void {
    const flown = shipPose(ship, tick);
    if (!flown) return;
    // Kept clear of the land on its way in and out: the room knows only the ground it brings its foes to.
    const under = ground(flown.at[0], flown.at[1]);
    const lift = under === null ? 0 : Math.max(0, under + CLEAR_OF_GROUND_M - flown.at[2]);
    const pose: ShipPose = lift > 0 ? { ...flown, at: [flown.at[0], flown.at[1], flown.at[2] + lift] } : flown;
    out.props.push({
      module: 'tithe-airship',
      at: pose.at,
      turn: pose.heading + Math.PI,
      scale: 1,
      rise: 1,
      lid: pose.pitch,
      glow: pose.burn,
      roll: pose.roll,
    });
    const module = moduleNumber('tithe-airship');
    if (module < 0) return;
    const socketAt = (name: string): Point => shipPoint(pose, moduleSocket(module, name));
    const along = (name: string, way: Point): [Point, Point] => {
      const socket = moduleSocket(module, name);
      const from = shipPoint(pose, socket);
      const to = shipPoint(pose, [socket[0] + way[0], socket[1] + way[1], socket[2] + way[2]]);
      return [from, [to[0] - from[0], to[1] - from[1], to[2] - from[2]]];
    };
    THRUSTS.forEach((name, nth) => {
      const facing = moduleSocketFacing(module, name);
      layFlame(
        out.marks,
        eye,
        along(name, [facing[0], facing[1], 0]),
        [pose.burn, LOOKS.flameWide, LOOKS.flameM],
        clock,
        nth,
      );
    });
    LIFTS.forEach((name, nth) => {
      layFlame(out.marks, eye, along(name, [0, 0, -1]), [pose.lift, LOOKS.liftWide, LOOKS.liftM], clock, nth + 5);
    });
    this.smoked(ship.id, STACKS.map(socketAt), pose, clock, out.marks, eye);
    const hatch = socketAt('hatch');
    for (const foe of fight.foes.values()) {
      const arrival = foe.arrival;
      if (!arrival || arrival.from !== ship.id || tick < arrival.drops || tick >= arrival.lands) continue;
      const left = 1 - (tick - arrival.drops) / Math.max(1, arrival.lands - arrival.drops);
      layBeam(out.marks, eye, hatch, [foe.view.x, foe.view.y, foe.view.z], left);
    }
    this.shipSounds(ship, { tick, clock, eye }, socketAt, out.sounds);
  }

  /** Smoke out of the ship's stacks, puffed as it flies and drifting off behind it. */
  private smoked(
    id: number,
    stacks: readonly Point[],
    pose: ShipPose,
    clock: number,
    marks: number[],
    eye: Point,
  ): void {
    const kept = this.smoke.get(id) ?? { puffs: [], last: -Infinity, roared: -Infinity };
    this.smoke.set(id, kept);
    if (clock - kept.last >= SMOKE_EVERY_S) {
      kept.last = clock;
      const back = -(1 + 3 * pose.burn);
      const drift = [Math.sin(pose.heading) * back, -Math.cos(pose.heading) * back] as const;
      for (const from of stacks) kept.puffs.push({ from, born: clock, drift });
    }
    // The oldest puffs first: those past their life go from the front.
    let spent = 0;
    while (spent < kept.puffs.length && clock - (kept.puffs[spent]?.born ?? clock) > LOOKS.smokeLife) spent++;
    if (spent > 0) kept.puffs.splice(0, spent);
    layPuffs(marks, eye, kept.puffs, clock);
  }

  /** A ship's sounds: its engines rumbling as it comes within a whole sound's reach of the eye on its way in, its fire
   *  roaring as it drives, its timbers as it hangs, its engines opening up as it leaves. Each beat heard once, and none
   *  it was long past when first seen. */
  private shipSounds(
    ship: ArrivalSeen,
    { tick, clock, eye }: { tick: number; clock: number; eye: Point },
    socketAt: (name: string) => Point,
    sounds: HeardSound[],
  ): void {
    const beats = this.beatsOf(ship.id, tick, [
      ['rumbles', ship.hangs],
      ['creaks', ship.hangs],
      ['leaves', ship.leaves],
    ]);
    const once = (beat: string, cue: string, where: Point, whole = false) => {
      if (beats.has(beat)) return;
      beats.add(beat);
      sounds.push(whole ? { cue, at: where, whole: true } : { cue, at: where });
    };
    const middle = socketAt('hatch');
    const near = Math.hypot(middle[0] - eye[0], middle[1] - eye[1], middle[2] - eye[2]) <= WHOLE_MOST_M;
    if (tick < ship.hangs && near) once('rumbles', 'amb.thunder.roll', middle, true);
    if (tick >= ship.hangs) once('creaks', 'amb.sea.hull.creak', middle);
    if (tick >= ship.leaves) once('leaves', 'ship.blast', socketAt('thrust-1'), true);
    const kept = this.smoke.get(ship.id);
    if (kept && clock - kept.roared >= ROAR_EVERY_S) {
      kept.roared = clock;
      sounds.push({
        cue: 'story.fire',
        at: socketAt(tick < ship.hangs || tick >= ship.leaves ? 'thrust-2' : 'lift-1'),
      });
    }
  }

  /** A crown as it lives at `tick`: its prop, its crystal gathering and its light down to its foes; broken, the
   *  crystal's wave and its shards falling. */
  private crown(
    crown: ArrivalSeen,
    { tick, clock, eye }: { tick: number; clock: number; eye: Point },
    out: { props: EventProp[]; sounds: HeardSound[]; marks: number[] },
    fight: ArrivalsFight,
  ): void {
    const state = crownState(crown, tick);
    if (!state) return;
    const heart: Point = [crown.at[0], crown.at[1], crown.at[2] + CROWN.highM];
    const beats = this.beatsOf(crown.id, tick, [
      ['forms', crown.began],
      ['breaks', crown.leaves + CROWN.crackTicks],
    ]);
    if (!beats.has('forms')) {
      beats.add('forms');
      out.sounds.push({ cue: 'amb.ice.ping', at: heart }, { cue: 'element.cosmic', at: heart });
    }
    if (state.broken) {
      if (!beats.has('breaks')) {
        beats.add('breaks');
        out.sounds.push({ cue: 'shield.break', at: heart, whole: true }, { cue: 'finish.cosmic', at: heart });
        latticeWaves.burst([heart[0], heart[1], heart[2] - 1.2], 'red', 2.4, clock);
        this.breakInto(heart, crown.heading, clock);
      }
      return;
    }
    out.props.push({
      module: 'lattice-crown',
      at: heart,
      turn: crown.heading,
      scale: state.scale,
      rise: 1,
      lid: 0,
      glow: state.glow,
    });
    if (tick < crown.hangs)
      layGathering(out.marks, eye, heart, (tick - crown.began) / Math.max(1, crown.hangs - crown.began), crown.heading);
    for (const foe of fight.foes.values()) {
      const arrival = foe.arrival;
      if (!arrival || arrival.from !== crown.id || tick < arrival.drops || tick >= arrival.lands) continue;
      const left = 1 - (tick - arrival.drops) / Math.max(1, arrival.lands - arrival.drops);
      layForming(out.marks, eye, heart, [foe.view.x, foe.view.y, foe.view.z], left);
    }
  }

  /** A broken crown's shards flung out from its heart, to fall and sink into the land. */
  private breakInto(heart: Point, turn: number, clock: number): void {
    for (let nth = 0; nth < FALL.shards; nth++) {
      const angle = turn + (nth * Math.PI * 2) / FALL.shards;
      const out = 2 + (nth % 3);
      this.falling.push({
        from: heart,
        away: [Math.cos(angle) * out, Math.sin(angle) * out, 2 + (nth % 2) * 2],
        spin: 3 + nth,
        broke: clock,
        struck: null,
      });
    }
  }

  /** Each falling shard's prop at `clock` into `props`: flying off and falling until it strikes the land under it
   *  (`ground`, the land's height, null off it: then its heart's height less the crown's), lying a moment where it
   *  struck, then sinking. */
  private shards(clock: number, ground: (x: number, y: number) => number | null, props: EventProp[]): void {
    this.falling = this.falling.filter((shard) => clock - shard.broke < 6);
    for (const shard of this.falling) {
      const since = clock - shard.broke;
      if (!shard.struck) {
        const up = shard.away[2];
        const place: Point = [
          shard.from[0] + shard.away[0] * since,
          shard.from[1] + shard.away[1] * since,
          shard.from[2] + up * since - 0.5 * FALL.gravity * since * since,
        ];
        const under = ground(place[0], place[1]) ?? shard.from[2] - CROWN.highM;
        const turn = shard.spin * since;
        if (place[2] > under) {
          props.push({ module: 'lattice-shard', at: place, turn, scale: 1.4, rise: 1, lid: turn * 0.7, glow: 1 });
          continue;
        }
        shard.struck = { at: [place[0], place[1], under], turn, lid: turn * 0.7, when: clock };
      }
      const { at, turn, lid, when } = shard.struck;
      const sinking = Math.max(0, clock - when - FALL.lies) / FALL.sinks;
      if (sinking < 1) props.push({ module: 'lattice-shard', at, turn, scale: 1.4, rise: 1 - sinking, lid, glow: 1 });
    }
  }

  /** Each foe's coming heard as it is let down or begins forming, and dust thrown up where a Grey Tithe foe lands off
   *  its beam: its arrival is kept from the room's word, which says no more of it once it has landed. */
  private foesLanding(fight: ArrivalsFight, tick: number, clock: number, marks: number[], sounds: HeardSound[]): void {
    for (const [id, foe] of fight.foes) {
      const arrival = foe.arrival;
      let coming = this.coming.get(id);
      if (!arrival && !coming) continue;
      const feet: Point = [foe.view.x, foe.view.y, foe.view.z];
      if (arrival && !coming && tick >= arrival.drops) {
        coming = { kind: arrival.kind, lands: arrival.lands, landed: null };
        this.coming.set(id, coming);
        sounds.push({ cue: arrival.kind === BRINGER.crown ? 'amb.ice.crack' : 'story.whoosh', at: feet });
      }
      // Where it landed: it may run off at once, and its dust stays.
      if (coming && coming.landed === null && (tick >= coming.lands || !arrival))
        coming.landed = { at: feet, when: clock };
      if (coming?.kind === BRINGER.airship && coming.landed)
        layLanding(marks, coming.landed.at, clock - coming.landed.when);
    }
    for (const id of this.coming.keys()) if (!fight.foes.has(id)) this.coming.delete(id);
  }

  /** Lets everything go, as a room joined anew starts its numbers again. */
  clear(): void {
    this.smoke.clear();
    this.heard.clear();
    this.coming.clear();
    this.falling = [];
  }
}
