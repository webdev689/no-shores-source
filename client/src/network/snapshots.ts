// Whole snapshots from those a room on land sends a player: each holds only the players and foes that changed since
// the snapshot its `base` names (one this page showed, and so holds), and those gone since; the rest stand as they
// stood then. What happened (the fight's events, the balls stopped) comes again in each snapshot until a later one is
// shown, so each is handed on once: only what is newer than the last snapshot handed on. A snapshot older than that,
// or built on one no longer held, is passed over; the room sends the next whole.
import { BODY_FLOATS, bodyOf } from '../rules/movementRules.ts';
import { type Changes, type FromRoomMessage, type SeenFoe, type SeenPlayer, foeOf } from './messages.ts';

type Snapshot = Extract<FromRoomMessage, { kind: 'snapshot' }>;

/** How many ticks of snapshots are held to build on: twice the two seconds the room keeps. */
const HELD_TICKS = 240n;

interface Held {
  readonly players: ReadonlyMap<number, SeenPlayer>;
  readonly foes: ReadonlyMap<number, SeenFoe>;
}

/** `numbers` with `changes` laid over them, a copy. */
function changed(numbers: Float64Array, changes: Changes): Float64Array {
  const laid = Float64Array.from(numbers);
  let next = 0;
  for (let index = 0; index < laid.length; index++)
    if ((changes.bits[index >> 3] ?? 0) & (1 << (index & 7))) laid[index] = changes.numbers[next++] ?? 0;
  return laid;
}

/** A player sent as the numbers of their fighter that changed, laid over the fighter `held` had; null with none. */
function laidOver(seen: SeenPlayer, held: SeenPlayer | undefined): SeenPlayer | null {
  if (!seen.changes || !held?.fighter) return null;
  const fighter = changed(held.fighter, seen.changes);
  const { player, acknowledged, standing, anim, frame, facing } = seen;
  const body = bodyOf(Array.from(fighter.subarray(0, BODY_FLOATS)));
  return { player, acknowledged, standing, anim, frame, facing, fighter, body };
}

const byNumber = <T>(kept: ReadonlyMap<number, T>): T[] =>
  [...kept.entries()].sort(([one], [two]) => one - two).map(([, each]) => each);

export class SnapshotKeeper {
  private readonly held = new Map<bigint, Held>();
  private last = -1n;

  /** Starts again, as a new welcome does: nothing held. */
  clear(): void {
    this.held.clear();
    this.last = -1n;
  }

  /** `snapshot` made whole, with only what happened since the last handed on; null for one to pass over. */
  whole(snapshot: Snapshot): Snapshot | null {
    if (snapshot.tick <= this.last) return null;
    const base = snapshot.base === 0n ? null : this.held.get(snapshot.base);
    if (snapshot.base !== 0n && !base) return null;
    const players = new Map(base?.players);
    const foes = new Map(base?.foes);
    for (const gone of snapshot.gonePlayers) players.delete(gone);
    for (const gone of snapshot.goneFoes) foes.delete(gone);
    for (const seen of snapshot.players) {
      const made = seen.changes ? laidOver(seen, players.get(seen.player)) : seen;
      if (!made) return null;
      players.set(seen.player, made);
    }
    for (const foe of snapshot.foes) {
      const held = foes.get(foe.id)?.numbers;
      if (foe.changes && !held) return null;
      foes.set(foe.id, foe.changes && held ? foeOf(foe.id, changed(held, foe.changes)) : foe);
    }
    this.held.set(snapshot.tick, { players, foes });
    for (const tick of this.held.keys()) if (tick + HELD_TICKS < snapshot.tick) this.held.delete(tick);
    const since = this.last;
    this.last = snapshot.tick;
    return {
      ...snapshot,
      base: 0n,
      gonePlayers: [],
      goneFoes: [],
      players: byNumber(players),
      foes: byNumber(foes),
      events: snapshot.events.filter((event) => event.tick > since),
      shots: snapshot.shots.filter((shot) => shot.stopped === 0n || shot.stopped > since),
    };
  }
}
