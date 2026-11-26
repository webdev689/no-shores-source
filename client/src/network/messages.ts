import * as flatbuffers from 'flatbuffers';
import { FromRoom, Input } from '../../../generated/messages/ts/overlook/wire.ts';
import { Ask } from '../../../generated/messages/ts/overlook/wire/ask.ts';
import type { Dressed } from '../../../generated/messages/ts/overlook/wire/dressed.ts';
import { GLANCE_FLOATS, UNTRIMMED_FLOATS } from '../rules/fighters.ts';
import { type FleetPart, commissionOf, fleetOf, heldIn, point, whole, wholeIn } from './fleetMessages.ts';
import { type GearAsk, type GearState, gearOf } from './gearMessages.ts';
import { type CastAsk, type SeenSpell, spellsOf } from './artMessages.ts';
import { BODY_FLOATS, type Body, CONTROLS_FLOATS, bodyOf } from '../rules/movementRules.ts';
import { unpack } from './pack.ts';
import { withOthers } from './seaFight.ts';
import { type PublicEvent, publicOf } from './publicMessages.ts';
import { type EncounterSeen, encounterOf } from './encounterMessages.ts';
import { type BreachSeen, breachOf } from './breachMessages.ts';
import { type HarbourPart, harbourOf } from './seaHarbour.ts';
import { type PlayerPlate, platesOf } from './plateMessages.ts';
import { type ArrivalSeen, type FoeArrival, arrivalsOf, foeArrivalOf } from './arrivalMessages.ts';

/** What a player's figure shows on their own screen: the forge's move, its frame, and the way it faces. */
export interface Look {
  readonly anim: string;
  readonly frame: number;
  readonly facing: number;
}

/** Where a body stands with its node's section: inside, warned with `ticks` left before it dies, or dead `ticks`, by
 *  a fall in a social space or by straying. */
export type Standing =
  | { readonly kind: 'inside' }
  | { readonly kind: 'warned'; readonly ticks: number }
  | { readonly kind: 'dead'; readonly ticks: number; readonly fell: boolean };

/** The standings in the order the messages number them: 2 dead by straying, 3 dead by a fall. */
const STANDINGS = ['inside', 'warned', 'dead', 'dead'] as const;
const FELL = 3;

/** One player as a room last stepped them, what their figure showed with it, the number of their last input it took,
 *  their whole fighter in the combat crate's order, and where they stand with its section. In the sea room, a player
 *  off the helm, their body on the ship's deck, in its own frame, with no fighter. */
export interface SeenPlayer extends Look {
  readonly player: number;
  readonly acknowledged: number;
  readonly body: Body;
  readonly fighter: Float64Array | null;
  readonly standing: Standing;
  /** In a snapshot built on another, the player's own fighter as only its numbers that changed since, a bit set for
   *  each (`snapshots.ts` lays them over the fighter it holds); then `fighter` is null and `body` stands for nothing. */
  readonly changes?: { readonly bits: Uint8Array; readonly numbers: Float64Array };
}

/** A player's dress as their browser wrote it; the room only carries it. */
export interface PlayerDress {
  readonly player: number;
  readonly dress: string;
}

/** One ship as the sea room last moved it: where it is, its heading in radians clockwise from north, and its pace, 0
 *  at rest; and as its player keeps it: its hull's number, each part's dress (paint, stripe, canvas, flag) by its
 *  number in content/gear/ship_dress.json, its name's two words by their places in content/gear/shipyard.json's lists
 *  (255 for none), and the emblem its player wears by its number, which a flag that bears one flies. */
export interface SeenShip {
  readonly player: number;
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly pace: number;
  readonly hull: number;
  readonly dress: readonly number[];
  readonly name: readonly number[];
  readonly emblem: number;
}

/** A hostile ship at sea, the Grey Tithe's: its number, where it is, its heading in radians clockwise
 *  from north, its faction (1 the Grey Tithe), its rank (1 Minor to 5 Boss), its hull (0 the Sloop to 3
 *  the Frigate), its level (0 none), the distance it is sighted from, metres (0 from a room that sends none), and its
 *  way at sea, metres a second at the world's own time. */
export interface SeenHostile {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly faction: number;
  readonly rank: number;
  readonly hull?: number;
  readonly level?: number;
  readonly sight?: number;
  readonly way?: number;
}

/** A player's fight at sea as the room last stepped it: the naval crate's numbers (crates/naval/src/wire.rs), its other
 *  captains put back in the view (`withOthers`), which `fightViewOf` reads, and its captain's faction, rank and hull. */
export interface SeenSeaFight {
  readonly player: number;
  readonly view: Float64Array;
  readonly faction: number;
  readonly rank: number;
  readonly hull?: number;
  /** Whether the player may board a captain of it now, as the sea would take the boarding. */
  readonly mayBoard?: boolean;
  /** Whether it is the Harbourmaster's hulk's fight, the sailing lesson's. */
  readonly lesson?: boolean;
}

/** A node's room's word on where its player is: the node's id, and the rect (west, north, east, south) its window of
 *  the ground is cut to, for the browser to cut the same. */
export interface JoinedNode {
  readonly id: string;
  readonly bounds: readonly [number, number, number, number];
}

/** A foe as a room last stepped it: its number, its role's number (`kind`), a glance at its fighter, its type's number
 *  in the rules' roster, its rank (1 Minor to 5 Boss), its faction's number, the phase it fights in (1 to 3), and how
 *  alert it is (0 idle, 1 suspicious, 2 alert, 3 searching). */
export interface SeenFoe {
  readonly id: number;
  readonly kind: number;
  readonly glance: Float64Array;
  readonly type: number;
  readonly rank: number;
  readonly faction: number;
  readonly phase: number;
  readonly alert: number;
  /** Its level; 0 for a foe of none, which fights by combat's own numbers. */
  readonly level: number;
  /** Its shield, if it stands with one: its element (the gear crate's numbers), what it holds still and held whole. */
  readonly shield: FoeShield | null;
  /** Its debuffs; none for a foe made by hand. */
  readonly statuses?: FoeStatuses;
  /** The name it stands under in place of its type's: a public event's Warden or Marrow, or the Fissure's growth. */
  readonly name?: string;
  /** The companion it is, an officer ashore fighting beside their leader; none for a foe. */
  readonly companion?: Companion | null;
  /** Its arrival while it arrives (`arrivalMessages.ts`); none once landed. */
  readonly arrival?: FoeArrival | null;
  /** All its numbers as they crossed, for the next snapshot to build on (`snapshots.ts`). */
  readonly numbers?: Float64Array;
  /** In a snapshot built on another, only its numbers that changed since, a bit set for each. */
  readonly changes?: Changes;
}

/** A companion: their leader's player number, their officer's given and family names' places in
 *  `content/gear/crew.json`, and their officer's post (0 First Mate to 4 Lookout), which dresses them. */
export interface Companion {
  readonly leader: number;
  readonly given: number;
  readonly family: number;
  readonly post: number;
}

/** The numbers of a fighter or a foe that changed since the snapshot one is built on, in order, a bit set for each:
 *  the first number's the lowest bit of the first byte. */
export interface Changes {
  readonly bits: Uint8Array;
  readonly numbers: Float64Array;
}

/** How many numbers a foe crosses as, packed: its glance and twenty-one more (crates/protocol/src/land.rs). */
const FOE_NUMBERS = GLANCE_FLOATS + 21;

/** A foe from all its numbers as they crossed: its glance, then the rest in the order the room packs them. */
export function foeOf(id: number, numbers: Float64Array): SeenFoe {
  const glance = numbers.slice(0, GLANCE_FLOATS);
  const [kind, type, rank, faction, phase, alert, level, element, left, most, expose, charge, chargeImmune, ...more] =
    Array.from(numbers.subarray(GLANCE_FLOATS));
  const shield = (element ?? 0) > 0 ? { element: element ?? 0, left: left ?? 0, most: most ?? 0 } : null;
  const named = { type: type ?? 0, rank: rank ?? 0, faction: faction ?? 0, phase: phase ?? 0, alert: alert ?? 0 };
  const statuses = { expose: expose ?? 0, charge: charge ?? 0, chargeImmune: chargeImmune ?? 0 };
  // Then a companion's leader (0 for a foe), its officer's given and family names, and post; last, its arrival.
  const [leader = 0, given = 0, family = 0, post = 0, ...arriving] = more;
  const companion = leader > 0 ? { leader, given, family, post } : null;
  const arrival = foeArrivalOf(arriving);
  return { id, kind: kind ?? 0, glance, level: level ?? 0, shield, ...named, statuses, companion, arrival, numbers };
}

/** The values `bytes` packs for the bits set in `bits`, each measured from `middle` by the number it is. */
function changedValues(bytes: Uint8Array | null, bits: Uint8Array, middle: readonly number[]): Float64Array | null {
  const places: number[] = [];
  bits.forEach((byte, place) => {
    for (let bit = 0; bit < 8; bit++) if (byte & (1 << bit)) places.push(place * 8 + bit);
  });
  const values = bytes && unpack(bytes, places.length, [0, 0]);
  return values && values.map((value, index) => value + (middle[places[index] ?? -1] ?? 0));
}

/** A foe's debuffs as the room keeps them: the ticks left of its Expose and its Charge, and of the immunity a Charge
 *  leaves after it. */
export interface FoeStatuses {
  readonly expose: number;
  readonly charge: number;
  readonly chargeImmune: number;
}

/** A foe's shield: its element, what it holds still, and what it held whole. */
export interface FoeShield {
  readonly element: number;
  readonly left: number;
  readonly most: number;
}

/** A foe a player asks the room to stand before them: a type's number in the roster, a rank (one the type does not
 *  come in takes its first) and the element of a shield it stands with (the gear crate's number, none if 0); or every
 *  foe sent away. */
export type FoeAsk = { readonly type: number; readonly rank: number; readonly shield?: number } | 'clear';

/** The number an input's `spawn` carries to send every foe away. */
const CLEAR_FOES = 255;
/** An input's `spawn` carries a shield's element above a foe's four bits (crates/room/src/foes.rs `SHIELD_SHIFT`). */
export const SHIELD_SHIFT = 4;

/** Something that happened in the fight, as the room numbers it. */
export interface FightEvent {
  readonly tick: bigint;
  readonly kind: number;
  readonly how: number;
  readonly striker: number;
  readonly defender: number;
  readonly amount: number;
  /** The stroke a swing came by, the combat crate's 1 to 6; 0 for anything else. */
  readonly stroke: number;
  /** Whether the blow was a crit, and the element it carried (the gear's 1 to 3, 0 for none); a room that does not
   *  say leaves them out. */
  readonly crit?: boolean;
  readonly element?: number;
  /** The fighter an Atheric's chain blow came from (the foe a leap or burst came from, the player a bite came from),
   *  on every event of that blow; 0 or left out for none. */
  readonly from?: number;
  /** The room's word on a hit of the player's own the page foresaw: its flash, sound and hold played as it landed. */
  readonly felt?: boolean;
}

/** A shot in flight, or a gun's ball in the tick it stopped: `age` is the ticks it has flown. A stopped ball's last
 *  segment runs from `at` to `at` plus a tick of its velocity, where it stopped, and carries the point it left its gun
 *  (`muzzle`); a shot still flying carries none. */
export interface FlyingShot {
  readonly owner: number;
  readonly ranged: number;
  readonly at: readonly [number, number, number];
  readonly velocity: readonly [number, number, number];
  readonly age: number;
  readonly muzzle: readonly [number, number, number] | null;
  /** The tick a stopped ball stopped; 0 for a shot still flying. */
  readonly stopped: bigint;
}

/** What a room says: its welcome, with the joining player's number, every dress so far, and its node in a node's
 *  room; or everyone after one of its ticks, with the dresses that changed and what happened in the fight since the
 *  last, the shots in flight, every ship at sea, and a fleet's ships, balls and what happened in its fight. */
export type FromRoomMessage =
  | {
      readonly kind: 'joined';
      readonly player: number;
      readonly dressed: readonly PlayerDress[];
      readonly plates: readonly PlayerPlate[];
      readonly node: JoinedNode | null;
      /** The room's protocol: its schema's hash. */
      readonly protocol: number;
      /** World time at the room's first tick, seconds (crates/sky's clock). */
      readonly epoch: number;
    }
  | ({
      readonly kind: 'snapshot';
      readonly tick: bigint;
      readonly players: readonly SeenPlayer[];
      readonly dressed: readonly PlayerDress[];
      /** On land, the plates that changed since the snapshot the screen showed; at sea, the plate of each other
       *  player's ship sent, every snapshot. */
      readonly plates: readonly PlayerPlate[];
      readonly foes: readonly SeenFoe[];
      readonly events: readonly FightEvent[];
      readonly shots: readonly FlyingShot[];
      readonly ships: readonly SeenShip[];
      readonly hostiles: readonly SeenHostile[];
      readonly fights: readonly SeenSeaFight[];
      /** Every spell in a room on land, which every player sees. */
      readonly spells: readonly SeenSpell[];
      /** A zone's public events; null in a room whose zone holds none. */
      readonly public: PublicEvent | null;
      /** An Elite Dungeon's encounters; null in any other room. */
      readonly encounter: EncounterSeen | null;
      /** A Breach, in its run or at its gate in the patrol zone; null in any other room. */
      readonly breach: BreachSeen | null;
      /** On land, the tick of the snapshot this one builds on (0 for none), and the players and foes gone since it:
       *  the players and foes it holds are those that changed since (`snapshots.ts` makes it whole again). */
      readonly base: bigint;
      readonly gonePlayers: readonly number[];
      readonly goneFoes: readonly number[];
      /** In a dungeon's room, its cache: x, y, z, the way it faces and 1 open or 0 shut; empty in any other. */
      readonly cache: readonly number[];
      /** In an Abyss run, the revives its company has left; -1 in any other room. */
      readonly revives: number;
      /** At a guild's outpost, how many plots its room has stood; 0 in any other room. */
      readonly outpost: number;
      /** On land, whether the room is a darkness zone, where no one respawns by their own ask; and who is reviving whom. */
      readonly darkness: boolean;
      readonly reviving: readonly Reviving[];
      /** On land, every airship and crown bringing foes. */
      readonly arrivals: readonly ArrivalSeen[];
    } & FleetPart &
      HarbourPart)
  | ({ readonly kind: 'gear' } & GearState);

/** A fallen player an ally is reviving: the fallen player's number, the ally's, and the share of the hold done. */
export interface Reviving {
  readonly fallen: number;
  readonly reviver: number;
  readonly progress: number;
}

/** A revive as a snapshot carries it, its share from per mille. */
function revivingOf(seen: { fallen(): number; reviver(): number; progress(): number } | null): Reviving {
  return { fallen: seen?.fallen() ?? 0, reviver: seen?.reviver() ?? 0, progress: (seen?.progress() ?? 0) / 1000 };
}

/** One tick's input beyond its number: the intent's numbers (the controls', then the fight's), what the player's figure
 *  shows, their dress when it changed, what their hands hold, the room tick their screen showed, what they ask of the
 *  foes (none if nothing) and the foe's level (0 for none), whether they ask to respawn, fallen, an ask of their gear,
 *  a spell cast (spell 0 carries only Dusk Daggers' aim while it is held), and whether they hold Use to revive. */
export interface InputParts {
  readonly intent: Float64Array;
  readonly look: Look;
  readonly dress?: string;
  readonly arms: number;
  readonly seen: bigint;
  readonly spawn?: FoeAsk | undefined;
  readonly spawnLevel?: number;
  readonly respawn?: boolean;
  readonly ask?: GearAsk;
  readonly cast?: CastAsk;
  /** A menu is open on the player's screen, which others see over their head. */
  readonly menu?: boolean;
  /** Use is held to revive a fallen ally beside the player (crates/room/src/revive.rs). */
  readonly revive?: boolean;
}

/** The most a ulong field holds. */
const ULONG_MOST = 2n ** 64n - 1n;

/** One tick's input as its bytes, as the schema defines them: its number, its arms and a foe's type refused outside
 *  what their fields hold (a RangeError), and its frame, the tick seen and a foe's rank held within theirs. It carries
 *  `earlier` inputs before it, oldest first, for a link that may lose one: the room takes those it has not had. */
export function inputBytes(
  sequence: number,
  parts: InputParts,
  earlier: readonly { readonly sequence: number; readonly parts: InputParts }[] = [],
): Uint8Array<ArrayBuffer> {
  const builder = new flatbuffers.Builder(320 * (1 + earlier.length));
  const before = earlier.map((each) => inputOffset(builder, each.sequence, each.parts, 0));
  const carried = before.length > 0 ? Input.createEarlierVector(builder, before) : 0;
  builder.finish(inputOffset(builder, sequence, parts, carried));
  return builder.asUint8Array().slice();
}

/** An ask written into an input being built. */
export function askOffset(builder: flatbuffers.Builder, ask: GearAsk): flatbuffers.Offset {
  const named = ask.named === undefined ? 0 : builder.createString(ask.named);
  Ask.startAsk(builder);
  Ask.addKind(builder, ask.kind);
  Ask.addItem(builder, ask.item ?? 0);
  Ask.addSlot(builder, ask.slot ?? 0);
  Ask.addColumn(builder, ask.column ?? 0);
  Ask.addNode(builder, ask.node ?? 0);
  Ask.addRarity(builder, ask.rarity ?? 0);
  Ask.addLevel(builder, ask.level ?? 0);
  Ask.addCount(builder, ask.count ?? 0);
  Ask.addItemKind(builder, ask.itemKind ?? 0);
  if (named) Ask.addNamed(builder, named);
  return Ask.endAsk(builder);
}

function inputOffset(builder: flatbuffers.Builder, sequence: number, parts: InputParts, earlier: number): number {
  const numbers = Array.from(parts.intent);
  const controls = Input.createControlsVector(builder, numbers.slice(0, CONTROLS_FLOATS));
  const combat = Input.createCombatVector(builder, numbers.slice(CONTROLS_FLOATS));
  const anim = builder.createString(parts.look.anim);
  const dressed = parts.dress === undefined ? 0 : builder.createString(parts.dress);
  const ask = parts.ask === undefined ? 0 : askOffset(builder, parts.ask);
  const aim = parts.cast?.aim ? Input.createCastAimVector(builder, [...parts.cast.aim]) : 0;
  Input.startInput(builder);
  Input.addSequence(builder, wholeIn(sequence, 0, 0xffff_ffff, "the input's number"));
  Input.addControls(builder, controls);
  Input.addAnim(builder, anim);
  Input.addFrame(builder, Math.floor(heldIn(parts.look.frame, 0, 0xffff, "the look's frame")));
  Input.addFacing(builder, parts.look.facing);
  if (dressed) Input.addDress(builder, dressed);
  Input.addCombat(builder, combat);
  Input.addArms(builder, wholeIn(parts.arms, 0, 0xffff_ffff, 'the arms'));
  Input.addSeen(builder, parts.seen < 0n ? 0n : parts.seen > ULONG_MOST ? ULONG_MOST : parts.seen);
  const spawn = parts.spawn;
  const shielded = spawn === undefined || spawn === 'clear' ? 0 : wholeIn(spawn.shield ?? 0, 0, 3, "the foe's shield");
  Input.addSpawn(builder, spawn === 'clear' ? CLEAR_FOES : shielded << SHIELD_SHIFT);
  Input.addRespawn(builder, parts.respawn ?? false);
  if (ask) Input.addAsk(builder, ask);
  Input.addSpawnLevel(builder, wholeIn(parts.spawnLevel ?? 0, 0, 0xff, "the foe's level"));
  if (spawn !== undefined && spawn !== 'clear') {
    Input.addSpawnType(builder, wholeIn(spawn.type, 0, 0xff, "the foe's type"));
    Input.addSpawnRank(builder, Math.round(heldIn(spawn.rank, 1, 5, "the foe's rank")));
  }
  if (parts.cast) Input.addCast(builder, wholeIn(parts.cast.spell, 0, 0xff, 'the spell'));
  if (aim) Input.addCastAim(builder, aim);
  if (earlier) Input.addEarlier(builder, earlier);
  if (parts.menu) Input.addMenu(builder, true);
  if (parts.revive) Input.addRevive(builder, true);
  return Input.endInput(builder);
}

/** The dresses a message holds. */
function dressesOf(count: number, entry: (index: number) => Dressed | null): PlayerDress[] {
  return Array.from({ length: count }, (unused, index) => {
    const each = entry(index);
    return { player: each?.player() ?? 0, dress: each?.dress() ?? '' };
  });
}

/** A standing from its number and ticks; a number the messages do not give reads as inside. */
function standingOf(number: number, ticks: number): Standing {
  const kind = STANDINGS[number] ?? 'inside';
  if (kind === 'dead') return { kind, ticks, fell: number === FELL };
  return kind === 'inside' ? { kind } : { kind, ticks };
}

/** The message a room's bytes hold, or null when they hold neither a welcome nor a snapshot that reads. */
export function readFromRoom(bytes: Uint8Array): FromRoomMessage | null {
  // The TypeScript runtime has no verifier, so a message cut short throws while it is read.
  try {
    const message = FromRoom.getRootAsFromRoom(new flatbuffers.ByteBuffer(bytes));
    const joined = message.joined();
    if (joined) {
      const dressed = dressesOf(joined.dressedLength(), (index) => joined.dressed(index));
      const [id, bounds] = [joined.node(), Array.from(joined.boundsArray() ?? [])];
      const [west = 0, north = 0, east = 0, south = 0] = bounds;
      const node = id !== null && bounds.length === 4 ? { id, bounds: [west, north, east, south] as const } : null;
      const [player, protocol, epoch] = [joined.player(), joined.protocol(), joined.epoch()];
      const plates = platesOf(joined.platesLength(), (index) => joined.plates(index));
      return { kind: 'joined', player, dressed, plates, node, protocol, epoch };
    }
    const gear = message.gear();
    if (gear) return { kind: 'gear', ...gearOf(gear) };
    const snapshot = message.snapshot();
    if (!snapshot) return null;
    // Everyone but the player a snapshot is for crosses packed, measured from the room's middle.
    const middle = Array.from(snapshot.middleArray() ?? [0, 0]);
    const unpacked = (bytes: Uint8Array | null, count: number, what: string) => {
      const numbers = bytes && unpack(bytes, count, middle);
      if (!numbers) throw new Error(`${what} does not unpack`);
      return numbers;
    };
    const players = Array.from({ length: snapshot.playersLength() }, (unused, index) => {
      const seen = snapshot.players(index);
      if (!seen) throw new Error(`snapshot player ${index} is missing`);
      // A walker on a ship's deck crosses as their body alone, and has no fighter.
      const numbers = seen.fighterArray();
      const packed = seen.packedArray();
      const bits = seen.changedArray();
      // The player it is for has their changed numbers whole; everyone else theirs packed.
      const changedNumbers = bits && (packed ? changedValues(packed, bits, middle) : Float64Array.from(numbers ?? []));
      if (bits && !changedNumbers) throw new Error(`player ${index}'s changes do not unpack`);
      const changes = bits && changedNumbers ? { bits, numbers: changedNumbers } : undefined;
      const walker = !changes && numbers?.length === BODY_FLOATS;
      const fighter =
        walker || changes
          ? null
          : packed
            ? unpacked(packed, UNTRIMMED_FLOATS, `player ${index}'s fighter`)
            : whole(numbers, UNTRIMMED_FLOATS, `player ${index}'s fighter`);
      // A fighter's first numbers are its body: the room sends them once.
      const body = bodyOf(Array.from((fighter ?? Float64Array.from(numbers ?? [])).subarray(0, BODY_FLOATS)));
      const look = { anim: seen.anim() ?? '', frame: seen.frame(), facing: seen.facing() };
      const standing = standingOf(seen.standing(), seen.standingTicks());
      const read = { player: seen.player(), acknowledged: seen.acknowledged(), body, fighter, standing, ...look };
      return changes ? { ...read, changes } : read;
    });
    const foes = Array.from({ length: snapshot.foesLength() }, (unused, index) => {
      const foe = snapshot.foes(index);
      if (!foe) throw new Error(`snapshot foe ${index} is missing`);
      const bits = foe.changedArray();
      // The name it stands under crosses each time the foe does, beside its numbers.
      const name = foe.name();
      const named = name ? { name } : {};
      if (!bits) return { ...foeOf(foe.id(), unpacked(foe.packedArray(), FOE_NUMBERS, `foe ${index}`)), ...named };
      const numbers = changedValues(foe.packedArray(), bits, middle);
      if (!numbers) throw new Error(`foe ${index}'s changes do not unpack`);
      return { ...foeOf(foe.id(), new Float64Array(FOE_NUMBERS)), changes: { bits, numbers }, ...named };
    });
    const events = Array.from({ length: snapshot.eventsLength() }, (unused, index) => {
      const event = snapshot.events(index);
      return {
        tick: event?.tick() ?? 0n,
        kind: event?.kind() ?? 0,
        how: event?.how() ?? 0,
        striker: event?.striker() ?? 0,
        defender: event?.defender() ?? 0,
        amount: event?.amount() ?? 0,
        stroke: event?.stroke() ?? 0,
        crit: event?.crit() ?? false,
        element: event?.element() ?? 0,
        from: event?.from() ?? 0,
      };
    });
    const shots = Array.from({ length: snapshot.shotsLength() }, (unused, index) => {
      const shot = snapshot.shots(index);
      return {
        owner: shot?.owner() ?? 0,
        ranged: shot?.ranged() ?? 0,
        at: point(shot?.atArray() ?? null),
        velocity: point(shot?.velocityArray() ?? null),
        age: shot?.age() ?? 0,
        muzzle: shot?.muzzleArray()?.length === 3 ? point(shot.muzzleArray()) : null,
        stopped: shot?.stopped() ?? 0n,
      };
    });
    const ships = Array.from({ length: snapshot.shipsLength() }, (unused, index) => {
      const ship = snapshot.ships(index);
      if (!ship) throw new Error(`snapshot ship ${index} does not read`);
      const [dress, name] = [Array.from(ship.dressArray() ?? []), Array.from(ship.nameArray() ?? [])];
      const [player, x, y, heading, pace] = [ship.player(), ship.x(), ship.y(), ship.heading(), ship.pace()];
      return { player, x, y, heading, pace, hull: ship.hull(), dress, name, emblem: ship.emblem() };
    });
    const hostiles = Array.from({ length: snapshot.hostilesLength() }, (unused, index) => {
      const hostile = snapshot.hostiles(index);
      if (!hostile) throw new Error(`snapshot hostile ${index} does not read`);
      const { faction, rank } = commissionOf(hostile.faction(), hostile.rank());
      const [hull, level, sight, way] = [hostile.hull(), hostile.level(), hostile.sight(), hostile.way()];
      return {
        id: hostile.id(),
        x: hostile.x(),
        y: hostile.y(),
        heading: hostile.heading(),
        faction,
        rank,
        hull,
        level,
        sight,
        way,
      };
    });
    const fights = Array.from({ length: snapshot.fightsLength() }, (unused, index) => {
      const fight = snapshot.fights(index);
      if (!fight) throw new Error(`snapshot fight ${index} does not read`);
      const { faction, rank } = commissionOf(fight.faction(), fight.rank());
      const view = withOthers(fight.viewArray() ?? [], fight.othersArray());
      return {
        player: fight.player(),
        view,
        faction,
        rank,
        hull: fight.hull(),
        mayBoard: fight.mayBoard(),
        lesson: fight.lesson(),
      };
    });
    const dressed = dressesOf(snapshot.dressedLength(), (index) => snapshot.dressed(index));
    return {
      kind: 'snapshot',
      tick: snapshot.tick(),
      players,
      dressed,
      plates: platesOf(snapshot.platesLength(), (index) => snapshot.plates(index)),
      foes,
      events,
      shots,
      ships,
      hostiles,
      fights,
      spells: spellsOf(snapshot),
      public: publicOf(snapshot),
      encounter: encounterOf(snapshot),
      breach: breachOf(snapshot),
      base: snapshot.base(),
      gonePlayers: Array.from(snapshot.gonePlayersArray() ?? []),
      goneFoes: Array.from(snapshot.goneFoesArray() ?? []),
      cache: Array.from(snapshot.cacheArray() ?? []),
      revives: snapshot.revives(),
      outpost: snapshot.outpost(),
      darkness: snapshot.darkness(),
      reviving: Array.from({ length: snapshot.revivingLength() }, (unused, index) =>
        revivingOf(snapshot.reviving(index)),
      ),
      arrivals: arrivalsOf(snapshot),
      ...fleetOf(snapshot),
      ...harbourOf(snapshot),
    };
  } catch {
    return null;
  }
}
