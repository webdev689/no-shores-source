// The world's sounds: each fighter's swings, blows, guards, shots, steps, jumps and rolls, the Arts' spells and the
// statuses they give, the drops landing and the player standing again, heard where each happens. A cue plays only once
// the owner has picked its recording on the sound sheet (soundSamples.ts); until then it is silent, never stood in for.

import type { GlowLook } from '../elementGlow.ts';
import type { FightEvent } from '../network/messages.ts';
import type { Placed } from '../player/figures.ts';
import { ridersOf } from '../player/others.ts';
import type { Fired } from '../rules/combatRules.ts';
import { type Action, type FighterView, type StatusName, fighterView } from '../rules/fighters.ts';
import { audioPoint, listen } from '../listener.ts';
import { playSample, recorded, rushOfCue } from '../soundSamples.ts';
import { EVENT, blowLook } from './cues.ts';
import { HorseSounds, type Rider } from './horseSounds.ts';
import type { Fighting } from './fighting.ts';
import { elementOfArt } from './spellLooks.ts';
import type { Struck } from './tracers.ts';
import {
  type Air,
  type StepGround,
  actionCue,
  airCue,
  armsOf,
  eventCues,
  isAnima,
  isGun,
  orbBurst,
  shotCue,
  spellCues,
  statusCues,
  stepCue,
  stepsBetween,
  struckCue,
  type Voice,
  VOICES,
  voiceCue,
} from './worldCues.ts';

type Point = readonly [number, number, number];

/** Where the world's sounds play: a page's audio context and the node they go into (null: none may sound yet). */
export interface WorldOutput {
  readonly audio: AudioContext;
  readonly out: AudioNode;
}

/** What the sounds read of a fight. */
export type HeardFight = Pick<
  Fighting,
  'player' | 'own' | 'others' | 'foes' | 'spells' | 'shots' | 'castSent' | 'standing'
>;

/** One frame as the page has it: the fight and its events since the last, what its shots did (FightEffects'), the eye
 *  and its yaw, the player's walker, every other figure where it is drawn, the ground's blocks and land, the drops that
 *  came to rest, the Ammo crates carried, and whether a menu holds the world quiet. */
export interface WorldFrame {
  readonly seconds: number;
  readonly quiet: boolean;
  readonly fight: HeardFight;
  readonly events: readonly FightEvent[];
  readonly shots: { readonly fired: readonly Fired[]; readonly struck: readonly Struck[] };
  readonly eye: Point;
  readonly yaw: number;
  readonly walker: {
    readonly feet: Point;
    readonly walked: number;
    readonly drawn: boolean;
    readonly mounted: boolean;
    /** The seconds the rider's boost still runs; none where left out. */
    readonly boosting?: number;
    readonly look: GlowLook;
    readonly pulled: boolean;
  };
  readonly others: ReadonlyMap<number, Placed>;
  readonly foes: ReadonlyMap<number, Placed>;
  readonly ground: StepGround;
  readonly landed: readonly Point[];
  readonly crates: number | null;
  /** Cues heard where something else happened: a public event's beats (game/publicView.ts). */
  readonly heard?: readonly { readonly cue: string; readonly at: Point }[];
}

type Play = (audio: AudioContext, out: AudioNode, id: string, rate: number) => AudioBufferSourceNode | null;

/** A sound is as loud as it is this close (metres), fading by distance beyond; none is played farther than the most. */
const NEAR_M = 2;
const MOST_M = 40;
/** A cue heard where something else happened (a public event's) holds its voice this long at most (seconds), fading
 *  out over the last of it, so no long recording keeps a voice from the fight. */
export const HEARD_MOST_S = 5;
const HEARD_FADE_S = 0.5;
/** The most sounds at once: past it, the farthest gives way. */
const MOST_VOICES = 16;
/** The same cue from the same fighter is heard once in this long (seconds), so a flurry is not a buzz. */
const GAP_S = 0.1;
/** How far a step's, a swing's or a blow's pitch strays either way, as a share of it, so a run of them never drones. */
const STRAY = 0.08;
const STRAYS = /^(step|swing|hit|horse)\./;
/** A figure that moved farther than this in a frame was placed afresh, not walked. */
const LEAP_M = 3;
/** A shot or spell first seen within this many ticks of its start is heard starting. */
const FRESH_TICKS = 10;
/** An Anima's release is heard once a caster in this long (seconds): a Tempest's later orbs are the same cast. */
const ONE_RELEASE_S = 2;
const FOE_ALERT = 2;
/** The rules' tick, seconds. */
const TICK_S = 1 / 60;

/** A fighter as last heard. */
interface Kept {
  readonly action: Action;
  readonly air: Air | null;
  readonly travelled: number;
  readonly at: Point;
  readonly drawn: boolean | null;
  readonly statuses: Partial<Record<StatusName, number>>;
  readonly alert: number;
}

/** A fighter as seen this frame. */
interface Seen {
  readonly id: number;
  readonly view: FighterView;
  readonly at: Point;
  readonly drawn: boolean | null;
  readonly statuses: Partial<Record<StatusName, number>>;
  readonly alert: number;
  /** A foe faction's own voice; none for a fighter on the players' side. */
  readonly voice: Voice | null;
}

/** The voice to stop for a new one `distance` away when `distances` already play: none while there is room, the
 *  farthest when the new one is nearer, else the new one itself ('new'). */
export function voiceToDrop(distances: readonly number[], distance: number, most = MOST_VOICES): number | 'new' | null {
  if (distances.length < most) return null;
  let farthest = 0;
  distances.forEach((each, index) => {
    if (each > (distances[farthest] ?? 0)) farthest = index;
  });
  return (distances[farthest] ?? 0) > distance ? farthest : 'new';
}

/**
 * The world's sounds, fed each frame with what the page already has. Each cue is heard where it happens through a
 * panner, the listener at the eye facing its yaw; every fighter's changes are read against the last frame's, so a
 * figure first seen makes no sound for what it was already doing.
 */
export class WorldSounds {
  private readonly live: () => WorldOutput | null;
  private readonly play: Play;
  private clock = 0;
  private readonly kept = new Map<number, Kept>();
  private readonly horses = new HorseSounds();
  private readonly spells = new Map<number, { kind: number; at: Point; age: number; life: number }>();
  private readonly released = new Map<number, number>();
  private readonly heardAt = new Map<string, number>();
  private youngest = new Map<number, number>();
  private castSent: object | null = null;
  private crates: number | null = null;
  private down = false;
  private voices: { readonly source: AudioBufferSourceNode; readonly distance: number }[] = [];
  /** The seconds into a cue's recording its rush comes, which a swing's whoosh is started that far ahead of its blow
   *  for. */
  private readonly rush: (cue: string) => number;

  constructor(live: () => WorldOutput | null, play: Play = playSample, rush: (cue: string) => number = rushOfCue) {
    this.live = live;
    this.play = play;
    this.rush = rush;
  }

  frame(frame: WorldFrame): void {
    this.clock += frame.seconds;
    const hidden = typeof document !== 'undefined' && document.hidden;
    const output = frame.quiet || hidden ? null : this.live();
    if (output) listen(output.audio, frame.eye, frame.yaw);
    const heard: { readonly cue: string; readonly at: Point; readonly key: number | null; readonly short?: true }[] =
      [];
    const hear = (cue: string | null, place: Point | null, key: number | null) => {
      if (cue && place) heard.push({ cue, at: place, key });
    };
    const seen = this.seen(frame);
    const byId = new Map(seen.map((one) => [one.id, one]));
    this.fighters(frame, seen, hear);
    this.horses.frame(heardRiders(frame), frame.seconds, frame.ground, hear);
    const { fight, walker } = frame;
    const spellLook = (id: number) => elementOfArt(fight.spells.arts.get(id));
    // A blow that kills is heard as its foe's death, not its hurt.
    const killed = new Set(frame.events.filter((event) => event.kind === EVENT.killed).map((event) => event.defender));
    for (const event of frame.events) {
      const [striker, defender] = [byId.get(event.striker), byId.get(event.defender)];
      const look = blowLook(event, { player: fight.player, own: walker.look, spellLook });
      const arms = { striker: striker?.view.arms ?? 0, defender: defender?.view.arms ?? 0, look };
      for (const { cue, at } of eventCues(event, arms))
        hear(
          cue,
          (at === 'striker' ? striker : defender)?.at ?? null,
          at === 'striker' ? event.striker : event.defender,
        );
      const voice = defender?.voice;
      if (voice && event.kind === EVENT.killed) hear(voiceCue(voice, 'death', recorded), defender.at, event.defender);
      if (voice && event.kind === EVENT.hit && !killed.has(event.defender))
        hear(voiceCue(voice, 'hurt', recorded), defender.at, event.defender);
    }
    this.shots(frame, hear);
    this.spellsCast(fight, hear);
    for (const place of frame.landed) hear('drop.land', place, null);
    for (const { cue, at } of frame.heard ?? []) heard.push({ cue, at, key: null, short: true });
    if (this.crates !== null && frame.crates !== null && frame.crates < this.crates)
      hear('ammo.refill', walker.feet, fight.player);
    this.crates = frame.crates;
    const sent = fight.castSent;
    if (sent && sent !== this.castSent && isAnima(sent.spell)) hear('cast.charge', walker.feet, fight.player);
    this.castSent = sent;
    const own = fight.own;
    if (walker.pulled && own?.ammo === 0 && isGun(armsOf(own.arms).ranged))
      hear('gun.empty', walker.feet, fight.player);
    const down = own?.action.kind === 'dead' || fight.standing.kind === 'dead';
    if (this.down && !down) hear('respawn', walker.feet, fight.player);
    this.down = down;
    if (output) for (const one of heard) this.sound(output, one.cue, one.at, one.key, frame.eye, one.short ?? false);
  }

  /** Every fighter this frame: the player at their walker's feet, the others and the foes where they are drawn. */
  private seen({ fight, walker, others, foes }: WorldFrame): Seen[] {
    const placeOf = (placed: Placed | undefined, view: FighterView): Point =>
      placed ? [placed.x, placed.y, placed.z] : [view.x, view.y, view.z];
    const seen: Seen[] = [];
    const own = fight.own;
    if (own)
      seen.push({
        id: fight.player,
        view: own,
        at: walker.feet,
        drawn: walker.drawn,
        statuses: own.statuses ?? {},
        alert: 0,
        voice: null,
      });
    for (const [id, other] of fight.others) {
      if (!other.fighter) continue;
      const view = fighterView(other.fighter);
      const placed = others.get(id);
      const drawn = placed?.dress.outfit.drawn ?? null;
      seen.push({ id, view, at: placeOf(placed, view), drawn, statuses: view.statuses ?? {}, alert: 0, voice: null });
    }
    for (const foe of fight.foes.values()) {
      const { id, view } = foe;
      seen.push({
        id,
        view,
        at: placeOf(foes.get(id), view),
        drawn: null,
        statuses: foe.statuses ?? {},
        // An ally's alert is the boarders' business: its cue is a foe noticing the player.
        alert: view.side === 'players' ? 0 : foe.alert,
        voice: view.side === 'players' ? null : (VOICES[foe.faction] ?? null),
      });
    }
    return seen;
  }

  /** Each fighter's changes since the last frame: its action, its air, its statuses, its weapon drawn or put away, its
   *  steps and a foe's alert. */
  private fighters(
    { fight, walker, ground, others }: WorldFrame,
    seen: readonly Seen[],
    hear: (cue: string | null, at: Point, key: number) => void,
  ): void {
    const present = new Set<number>();
    for (const one of seen) {
      const { id, view, at, drawn, statuses, alert, voice } = one;
      present.add(id);
      const kept = this.kept.get(id);
      const own = id === fight.player;
      const moved = kept ? Math.hypot(at[0] - kept.at[0], at[1] - kept.at[1]) : 0;
      const walked = kept && view.mode === 'ground' && moved < LEAP_M ? kept.travelled + moved : (kept?.travelled ?? 0);
      const travelled = own ? walker.walked : walked;
      const air = airCue(kept?.air ?? null, view.mode, view.z);
      this.kept.set(id, { action: view.action, air: air.air, travelled, at, drawn, statuses, alert });
      if (!kept) continue;
      const action = actionCue(kept.action, view.action, view.arms, (cue) => this.rush(cue) / TICK_S);
      hear(action, at, id);
      if (voice && action?.startsWith('swing.')) hear(voiceCue(voice, 'attack', recorded), at, id);
      hear(air.cue, at, id);
      for (const cue of statusCues(kept.statuses, statuses)) hear(cue, at, id);
      if (drawn !== null && kept.drawn !== null && drawn !== kept.drawn)
        hear(drawn ? 'weapon.draw' : 'weapon.sheathe', at, id);
      // A rider's horse is heard instead (`HorseSounds`).
      const riding = own ? walker.mounted : (others.get(id)?.anim.startsWith('horse') ?? false);
      if (!riding && stepsBetween(kept.travelled, travelled) > 0) hear(stepCue(at, ground), at, id);
      if (alert === FOE_ALERT && kept.alert !== FOE_ALERT)
        hear(voice ? voiceCue(voice, 'alert', recorded) : 'foe.alert', at, id);
    }
    for (const id of this.kept.keys()) if (!present.has(id)) this.kept.delete(id);
  }

  /** The shots: the player's own as their ticks let them go, everyone else's as a snapshot first carries them (each
   *  shooter's youngest shot grown younger is a new one), and where any stopped. */
  private shots({ fight, shots }: WorldFrame, hear: (cue: string | null, at: Point, key: number | null) => void): void {
    for (const fired of shots.fired) hear(shotCue(fired.ranged), fired.at, fight.player);
    const youngest = new Map<number, number>();
    for (const shot of fight.shots) {
      if (shot.owner === fight.player || (youngest.get(shot.owner) ?? Infinity) <= shot.age) continue;
      youngest.set(shot.owner, shot.age);
      const before = this.youngest.get(shot.owner);
      const fresh = before === undefined ? shot.age <= FRESH_TICKS : shot.age < before;
      if (fresh) hear(shotCue(shot.ranged), shot.muzzle ?? shot.at, shot.owner);
    }
    this.youngest = youngest;
    for (const struck of shots.struck) hear(struckCue(struck.surface, struck.ball), struck.at, null);
  }

  /** Each spell as it first appears, an Anima's release once a cast, and a Tempest orb bursting on what it sought. */
  private spellsCast(fight: HeardFight, hear: (cue: string | null, at: Point, key: number | null) => void): void {
    const present = fight.spells.spells;
    for (const [id, spell] of present) {
      const known = this.spells.has(id);
      this.spells.set(id, { kind: spell.kind, at: spell.at, age: spell.age, life: spell.life });
      if (known || spell.age > FRESH_TICKS) continue;
      if (isAnima(spell.kind)) {
        if (this.clock - (this.released.get(spell.caster) ?? -Infinity) < ONE_RELEASE_S) continue;
        this.released.set(spell.caster, this.clock);
        if (this.released.size > 64)
          for (const [each, when] of this.released) if (this.clock - when >= ONE_RELEASE_S) this.released.delete(each);
      }
      for (const cue of spellCues(spell.kind)) hear(cue, spell.at, spell.caster);
    }
    for (const [id, last] of this.spells)
      if (!present.has(id)) {
        this.spells.delete(id);
        if (orbBurst(last.kind, last.age, last.life)) hear('spell.orb', last.at, null);
      }
  }

  /** Plays one cue at `place` through its own panner, once its fighter has not just made it, within reach of the eye
   *  and room among the voices; an unpicked cue plays nothing. */
  private sound(output: WorldOutput, cue: string, place: Point, key: number | null, eye: Point, short = false): void {
    if (key !== null) {
      const heardKey = `${key}|${cue}`;
      if (this.clock - (this.heardAt.get(heardKey) ?? -Infinity) < GAP_S) return;
      this.heardAt.set(heardKey, this.clock);
      if (this.heardAt.size > 512)
        for (const [each, when] of this.heardAt) if (this.clock - when >= GAP_S) this.heardAt.delete(each);
    }
    const distance = Math.hypot(place[0] - eye[0], place[1] - eye[1], place[2] - eye[2]);
    const drop = voiceToDrop(
      this.voices.map((voice) => voice.distance),
      distance,
    );
    if (distance > MOST_M || drop === 'new') return;
    const { audio, out } = output;
    const panner = audio.createPanner();
    Object.assign(panner, {
      panningModel: 'equalpower',
      distanceModel: 'inverse',
      refDistance: NEAR_M,
      maxDistance: MOST_M,
    });
    // Placed in the listener's frame, whose origin the ambience may have moved to the player's ship.
    [panner.positionX.value, panner.positionY.value, panner.positionZ.value] = audioPoint(audio, place);
    panner.connect(out);
    const fade = short ? audio.createGain() : null;
    fade?.connect(panner);
    const source = this.play(audio, fade ?? panner, cue, STRAYS.test(cue) ? 1 + (Math.random() - 0.5) * STRAY : 1);
    if (!source) {
      fade?.disconnect();
      panner.disconnect();
      return;
    }
    if (fade) {
      const end = audio.currentTime + HEARD_MOST_S;
      fade.gain.setValueAtTime(1, end - HEARD_FADE_S);
      fade.gain.linearRampToValueAtTime(0, end);
      source.stop(end);
    }
    const stopped = drop === null ? null : this.voices[drop];
    if (stopped) {
      stopped.source.stop();
      this.voices = this.voices.filter((voice) => voice !== stopped);
    }
    const voice = { source, distance };
    this.voices.push(voice);
    source.addEventListener('ended', () => {
      this.voices = this.voices.filter((each) => each !== voice);
      fade?.disconnect();
      panner.disconnect();
    });
  }
}

/** Everyone as their horse is heard: the player by their walker, every other player as they are drawn. */
function heardRiders({ fight, walker, others }: WorldFrame): Rider[] {
  const own = { id: fight.player, feet: walker.feet, mounted: walker.mounted, boosting: walker.boosting ?? 0 };
  return [own, ...ridersOf(others, fight.others)];
}
