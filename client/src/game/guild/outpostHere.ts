import type { EventProp } from '../../city/eventProps.ts';
import { moduleNumber, moduleSocket } from '../../city/modules.ts';
import type { AccountLink, OutpostSeen } from '../../network/accounts.ts';
import { ASKS, type GearAsk } from '../../network/gearMessages.ts';
import type { Block } from '../../rules/movementRules.ts';
import type { Use } from '../footGear.ts';
import { OUTPOST_CHANGED, OUTPOST_DELVE, openGearWindow } from '../gearScreen.ts';
import type { Trips } from '../footTrips.ts';
import { DELVE_WORDS, gateOf, gateTier } from './delveRoom.ts';
import type { Hung } from './bannerCloth.ts';
import { type Banner, bannerFrom, bannerOfName } from './bannerLaw.ts';
import { nodeRoom } from '../rooms.ts';
import type { NodeInfo } from '../worldData.ts';
import { ghostOf, letGo, placingNow } from './decorPlacing.ts';
import { accountsHeld, guildLanded } from './guildHeld.ts';
import { ridAnswered, withRid } from './outpostAsks.ts';
import { type Decor, kindOf, pieceOf, type Plot, type Standing, tierName } from './outpostLaw.ts';
import type { AtEntrance, FootContext, Opened, OutpostJoined } from '../footPlace.ts';
import { HOLD_MS } from '../gearHold.ts';
import { type Ground, type Placed, decorPlaceOf, placeOf, plotBoxes, socketOf } from './outpostPlaces.ts';

/**
 * An outpost as the page stands it in its room: the plot read from the accounts on arriving, whenever the player
 * changes it, and every so often while there; each structure and piece of decoration drawn as a prop where the plot's
 * reckoning stands it, the same boxes walled in the page's own movement and fight as the room walls, and what E does
 * at each. A wild site, or one whose outpost is not raised, is bare ground with the standard's staff at its middle.
 */

/** How often the plot is read again while the player is there. */
const LOOK_MS = 15_000;
/** How near a structure's socket, or a piece of decoration, E reaches, metres. */
const REACH_M = 2.5;
/** How far behind a structure's socket, along the way its front faces, a player may stand and still use it. */
const BEHIND_M = 0.5;
/** How far before the player a piece being placed stands, past its own reach. */
const AHEAD_M = 1;
const GHOST_GREEN = [0.25, 0.85, 0.35] as const;
const GHOST_RED = [0.9, 0.2, 0.15] as const;
const RAISE_WORDS = "Raise your guild's outpost here from the Guild tab.";
/** What a site the player's guild has not raised shows at the plot's middle: the Banner Standard's oak staff alone,
 *  no cloth on it, so the ground reads as a place to claim. */
const BARE_STAFF = 'outpost-standard-oak';

/** The socket a structure is used at: a gate's door, the stores of a camp or a dockyard, any other's use. */
function socketNameOf(kind: string): string {
  if (kind === 'gate') return 'door';
  return kind === 'camp' || kind === 'dock' ? 'stores' : 'use';
}

/** The ground an outpost site's plot stands on: its layout's plot's middle (its node's centre where it names none) and
 *  the level of the land there. */
export function groundOf(node: NodeInfo, floor: (x: number, y: number) => number): Ground {
  const [x, y] = node.places?.find((place) => /plot/i.test(place.name))?.at ?? node.centre;
  return { plot: [x, y], level: floor(x, y) };
}

/** What using a structure offers: delivering while it is built, the horn sounded where the player `runs` the
 *  outpost (its founder or an admin), or its name at its tier. */
export function useWords(standing: Standing, runs = false): string {
  const kind = kindOf(standing.kind);
  if (!kind) return '';
  if (standing.building > 0) return 'Deliver materials';
  if (kind.id === 'horn' && runs) return 'Sound the War Horn';
  return tierName(kind, Math.max(1, standing.tier));
}

/** How far out before the gate's door the outpost's room stands a player come back out (`Room::join_at`). */
const OUT_OF_GATE_M = 1.5;

/** A placed module as a prop standing whole. */
const propOf = (placed: Placed): EventProp => ({ ...placed, scale: 1, rise: 1, lid: 0, glow: 1 });

/** Where the outpost's room stands a player come back out of the guild dungeon: before the Delve Gate's door, facing
 *  away from it; null with no gate. */
export function outOfGate(seen: OutpostSeen, ground: Ground): Omit<AtEntrance, 'number'> | null {
  const gate = gateOf(seen.plot);
  if (!gate) return null;
  const facing = Math.PI + (gate.turn * Math.PI) / 2;
  const [doorX, doorY] = socketOf(gate, ground, bannerOf(seen).staff, 'door');
  return { x: doorX + Math.sin(facing) * OUT_OF_GATE_M, y: doorY - Math.cos(facing) * OUT_OF_GATE_M, facing };
}

/** Where a companion come out of the guild dungeon of the guild of `key` at `node` stands: before its gate, as the
 *  room stands them, read from the accounts; null where it cannot be read. */
export async function gateOut(node: NodeInfo, key: string): Promise<Omit<AtEntrance, 'number'> | null> {
  const answer = await accountsHeld()
    ?.outpost(nodeRoom(node, 'normal', key))
    .catch(() => null);
  const seen = answer && typeof answer !== 'string' ? answer.outpost : null;
  return seen
    ? outOfGate(
        seen,
        groundOf(node, () => 0),
      )
    : null;
}

/** The key a guild's outposts' rooms are named by, from its id. */
const keyOf = (seen: OutpostSeen): string => seen.guild.replaceAll('-', '').toLowerCase();

/** A guild's banner, as kept. */
function bannerOf(seen: OutpostSeen): Banner {
  try {
    return bannerFrom(JSON.parse(seen.banner)) ?? bannerOfName(seen.name);
  } catch {
    return bannerOfName(seen.name);
  }
}

/** Whatever keeps a course of blocks for bodies to run into: the page's movement, its fight. */
interface Course {
  setCourse(blocks: readonly Block[]): void;
}

export class OutpostHere {
  private seen: OutpostSeen | null = null;
  private asked = 0;
  private shown: readonly EventProp[];
  /** The outpost's banner and the cloth hung from its standard, worked out once a read. */
  private banner: Banner | null = null;
  private hung: Hung | null = null;
  /** The zone's own props and the list they were last joined into, kept while neither changes. */
  private joined: { besides: readonly EventProp[]; shown: readonly EventProp[]; all: readonly EventProp[] } | null =
    null;
  /** The room this page joined here, named by the key of the guild whose outpost it is (none at the wild site). */
  private readonly room: string;
  /** How many plots the room last said it has stood, none before it first says. */
  private plots: number | null = null;
  /** Each structure with the socket it is used at and the way its front faces (x east, y south), and each piece of
   *  decoration with where it stands, worked out once a read. */
  private sockets: readonly {
    readonly standing: Standing;
    readonly at: readonly [number, number];
    readonly front: readonly [number, number];
  }[] = [];
  private pieces: readonly { readonly decor: Decor; readonly at: readonly number[] }[] = [];
  /** The ghost of a piece being placed and the list it was last joined into, kept while it stands still. */
  private ghosted: {
    readonly key: string;
    readonly besides: readonly EventProp[];
    readonly shown: readonly EventProp[];
    readonly all: readonly EventProp[];
  } | null = null;
  /** A piece of decoration being taken up while E is held, since `since` on the page's clock. */
  private taking: { readonly id: number; readonly since: number } | null = null;
  /** The page's clock in milliseconds, which a hold is timed by. */
  clock = (): number => performance.now();
  /** The plot's boxes as last read, which the camera keeps clear of too. */
  walls: readonly Block[] = [];
  private takenUp: { readonly id: number; readonly why: string } | null = null;
  /** The way the player faced when last asked what E does: a piece being placed stands before them. */
  private facing = 0;
  private readonly timer: ReturnType<typeof setInterval>;

  readonly site: string;
  private readonly ground: Ground;
  private readonly link: AccountLink | null;
  private readonly course: { readonly boxes: readonly Block[]; readonly courses: readonly Course[] };
  /** The page's way into the guild dungeon, where it has one. */
  private readonly delve: Trips['enterDelve'];

  /** The guild whose outpost's room was joined, and whether it was the player's own. */
  readonly entered: OutpostJoined;
  /** What the room last said, the plots it has stood counted. */
  private readonly heard: { readonly plots: number };

  constructor(
    site: string,
    ground: Ground,
    link: AccountLink | null,
    course: { readonly boxes: readonly Block[]; readonly courses: readonly Course[] },
    delve: Trips['enterDelve'] = undefined,
    joined: OutpostJoined = { guild: null, own: true },
    heard: { readonly plots: number } = { plots: 0 },
  ) {
    [this.site, this.ground, this.link, this.course, this.delve] = [site, ground, link, course, delve];
    [this.entered, this.heard] = [joined, heard];
    this.room = nodeRoom({ id: site, kind: 'outpost' }, 'normal', joined.guild);
    this.shown = this.standing();
    this.look();
    this.timer = setInterval(this.look, LOOK_MS);
    addEventListener(OUTPOST_CHANGED, this.look);
    addEventListener(OUTPOST_DELVE, this.delveAsked);
  }

  /** The guild dungeon at `tier` (0 Normal to 2 Abyss), where the gate stands at it or higher: in by the page's trips,
   *  out before the gate's door, facing away from it. */
  private delveAt(tier: number): void {
    const { seen } = this;
    const out = seen ? outOfGate(seen, this.ground) : null;
    const top = seen ? gateTier(seen.plot) : null;
    if (!seen || !out || top === null || tier < 0 || tier > top) return;
    this.delve?.(keyOf(seen), tier, out);
  }

  private readonly delveAsked = (event: Event): void => {
    const tier = (event as CustomEvent<number>).detail;
    if (typeof tier === 'number') this.delveAt(tier);
  };

  /** The plot as last read, none before or where none is raised. */
  get plot(): Plot | null {
    return this.seen?.plot ?? null;
  }

  /** The outpost as last read. */
  get outpost(): OutpostSeen | null {
    return this.seen;
  }

  /** The ground the plot stands on. */
  get groundOf(): Ground {
    return this.ground;
  }

  /** Reads the plot again, keeping only the latest answer, and walls it. */
  readonly look = (): void => {
    const asked = ++this.asked;
    const link = this.link;
    if (!link) return;
    void link
      .outpost(this.room)
      .then((answer) => {
        if (asked !== this.asked || typeof answer === 'string') return;
        this.take(answer.outpost);
      })
      .catch(() => undefined);
  };

  /** Stands an outpost as read (null for none raised). */
  take(seen: OutpostSeen | null): void {
    this.seen = seen;
    this.banner = seen ? bannerOf(seen) : null;
    this.shown = this.standing();
    this.hung = this.hangs();
    this.walls = seen ? plotBoxes(seen.plot, this.ground, this.staff) : [];
    const { ground, staff } = this;
    this.sockets = (seen?.plot.structures ?? []).map((standing) => ({
      standing,
      at: socketOf(standing, ground, staff, socketNameOf(standing.kind)),
      front: [-Math.sin((standing.turn * Math.PI) / 2), Math.cos((standing.turn * Math.PI) / 2)] as const,
    }));
    this.pieces = (seen?.plot.decor ?? []).map((decor) => ({ decor, at: decorPlaceOf(decor, ground).at }));
    for (const course of this.course.courses) course.setCourse([...this.course.boxes, ...this.walls]);
  }

  /** The staff the outpost's banner hangs from. */
  private get staff(): string {
    return this.banner?.staff ?? '';
  }

  /** The guild's banner cloth, hung from its standard's `cloth` socket; none before the standard stands. */
  cloth(): Hung | null {
    return this.hung;
  }

  private hangs(): Hung | null {
    const { seen, ground, banner } = this;
    const standard = seen?.plot.structures.find((standing) => standing.kind === 'standard' && standing.building === 0);
    if (!seen || !standard || !banner) return null;
    const placed = placeOf(standard, ground, banner.staff);
    const [x, y, z] = moduleSocket(moduleNumber(placed.module), 'cloth');
    const [cos, sin] = [Math.cos(placed.turn), Math.sin(placed.turn)];
    const top = [placed.at[0] + x * cos - y * sin, placed.at[1] + x * sin + y * cos, placed.at[2] + z] as const;
    return { at: top, turn: placed.turn, banner };
  }

  /** The props the outpost stands as beside `besides` (the zone's own), kept as one list while nothing changes, and
   *  the ghost of a piece being placed at `feet`. */
  props(besides: readonly EventProp[] = [], feet?: readonly [number, number]): readonly EventProp[] {
    const ghost = feet ? this.ghost(feet) : null;
    if (ghost) {
      const key = `${ghost.module} ${ghost.at.join()} ${ghost.turn} ${ghost.tint?.join() ?? ''}`;
      const { ghosted } = this;
      const { shown } = this;
      if (ghosted?.key !== key || ghosted.besides !== besides || ghosted.shown !== shown)
        this.ghosted = { key, besides, shown, all: [...besides, ...shown, ghost] };
      return this.ghosted?.all ?? [];
    }
    if (besides.length === 0) return this.shown;
    const { joined, shown } = this;
    if (joined?.besides !== besides || joined.shown !== shown)
      this.joined = { besides, shown, all: [...besides, ...shown] };
    return this.joined?.all ?? shown;
  }

  /** The piece being placed here, stood just before the player (clear of their body, which it would wall in), and
   *  the law's words on it. */
  private placing(feet: readonly [number, number]) {
    const placing = placingNow();
    const { seen } = this;
    if (!placing || placing.site !== this.site || !seen) return null;
    const ahead = AHEAD_M + (pieceOf(placing.piece)?.reach ?? 0);
    const spot = [feet[0] + Math.sin(this.facing) * ahead, feet[1] - Math.cos(this.facing) * ahead] as const;
    return { placing, ...ghostOf(placing, spot, seen.plot, this.ground) };
  }

  /** A piece being placed as its ghost: green where it may stand, red where not. */
  private ghost(feet: readonly [number, number]): EventProp | null {
    const placed = this.placing(feet);
    if (!placed) return null;
    const tint = placed.refusal === null ? GHOST_GREEN : GHOST_RED;
    return { ...propOf(decorPlaceOf({ id: 0, ...placed.decor }, this.ground)), tint };
  }

  /** Places the piece being placed where it stands, as the accounts allow, telling the room once it is. */
  private place(feet: readonly [number, number], ask: (asked: GearAsk) => void): Use | null {
    const placed = this.placing(feet);
    if (!placed) return null;
    const { placing, decor, refusal, name } = placed;
    const link = this.link;
    const spot = `${decor.x},${decor.y},${decor.turn}`;
    placing.refused = refusal !== null;
    // The accounts' last refusal shows only while the piece stands where it was refused.
    if (placing.said !== null && placing.saidAt !== spot) placing.said = null;
    const run = () => {
      if (refusal !== null || placing.sending || !link) return;
      placing.sending = true;
      const sent = withRid('outpost/decorate', { site: this.site, ...decor });
      void link.social('outpost/decorate', sent).then((why) => {
        placing.sending = false;
        [placing.said, placing.saidAt] = [why, spot];
        if (why !== null) return;
        ridAnswered(sent);
        letGo();
        ask({ kind: ASKS.outpostChanged });
        dispatchEvent(new Event(OUTPOST_CHANGED));
      });
    };
    return { words: refusal ?? placing.said ?? `Place the ${name}`, run };
  }

  /** Every prop the outpost stands as: each structure and piece of decoration, or the post while it is bare. */
  private standing(): EventProp[] {
    const { seen, ground } = this;
    if (!seen) {
      return [propOf({ module: BARE_STAFF, at: [...ground.plot, ground.level], turn: 0 })];
    }
    const { staff } = this;
    return [
      ...seen.plot.structures.map((standing) => propOf(placeOf(standing, ground, staff))),
      ...seen.plot.decor.map((decor) => propOf(decorPlaceOf(decor, ground))),
    ];
  }

  /** What E does at (`x`, `y`): opens the Guild tab on the structure whose socket is near, takes up a piece of
   *  decoration, or, while the outpost is bare, says how to raise it. */
  readonly uses = (
    x: number,
    y: number,
    ask: (asked: GearAsk) => void,
    facing = this.facing,
    useHeld = false,
  ): Use | null => {
    this.facing = facing;
    this.hear();
    const placing = this.place([x, y], ask);
    if (placing) return placing;
    const { seen, ground, site } = this;
    const near = ([atX, atY]: readonly [number, number] | readonly number[]) =>
      Math.hypot((atX ?? 0) - x, (atY ?? 0) - y) <= REACH_M;
    if (!seen) {
      return near(ground.plot)
        ? { words: RAISE_WORDS, run: () => openGearWindow({ view: 'guild', outpost: { site } }) }
        : null;
    }
    const top = gateTier(seen.plot);
    const runs = this.runs(seen);
    for (const { standing, at, front } of this.sockets) {
      // Used from its front alone: never through its back wall, its socket within reach beyond it.
      if (!near(at) || (x - at[0]) * front[0] + (y - at[1]) * front[1] < -BEHIND_M) continue;
      // A gate standing goes down at its highest tier; a lower one is chosen on the Guild tab.
      if (standing.kind === 'gate' && standing.building === 0 && top !== null && this.delve)
        return { words: `Delve: ${DELVE_WORDS[top] ?? ''}`, run: () => this.delveAt(top) };
      const outpost = { site, structure: standing.id };
      return { words: useWords(standing, runs), run: () => openGearWindow({ view: 'guild', outpost }) };
    }
    const piece = this.pieces.find(({ at }) => near(at))?.decor;
    if (!piece || !this.link || !runs) {
      this.taking = null;
      return null;
    }
    return this.takeUp(piece, ask, useHeld);
  };

  /** Whether the player is the founder or an admin of the guild whose outpost this is, as the guild was last read. */
  private runs(seen: OutpostSeen): boolean {
    const guild = guildLanded();
    return guild !== null && guild.key === keyOf(seen) && guild.rank <= 1;
  }

  /** Reads the plot again when the room says it has stood another. */
  private hear(): void {
    const { plots } = this.heard;
    if (this.plots !== null && plots !== this.plots) this.look();
    this.plots = plots;
  }

  /** Taking up `piece`, as the page holds a structure's take-down: E pressed begins it, held through it is asked of
   *  the accounts, let go before it is not. */
  private takeUp(piece: Decor, ask: (asked: GearAsk) => void, useHeld: boolean): Use {
    const link = this.link;
    const { site } = this;
    const now = this.clock();
    if (this.taking && (this.taking.id !== piece.id || !useHeld)) this.taking = null;
    const share = this.taking ? (now - this.taking.since) / HOLD_MS : null;
    if (this.taking && share !== null && share >= 1 && link) {
      this.taking = null;
      const sent = withRid('outpost/undecorate', { site, id: piece.id });
      void link.social('outpost/undecorate', sent).then((why) => {
        this.takenUp = why === null ? null : { id: piece.id, why };
        if (why !== null) return;
        ridAnswered(sent);
        ask({ kind: ASKS.outpostChanged });
        dispatchEvent(new Event(OUTPOST_CHANGED));
      });
    }
    // A refusal is said where the piece stands, as the use prompt's words.
    const refused = this.takenUp?.id === piece.id ? this.takenUp.why : null;
    const words = refused ?? `Take up the ${pieceOf(piece.piece)?.name ?? 'decoration'}`;
    const run = () => void (this.taking = { id: piece.id, since: this.clock() });
    return share === null || !this.taking ? { words, run } : { words, run, held: Math.min(1, share) };
  }

  /** Whether the player, in the room of their own guild's outpost (or the wild site), belongs in another now that
   *  their guild is `key`: they founded, joined or left one here. A companion's guest stays. */
  rejoins(key: string | null): boolean {
    return this.entered.own && key !== this.entered.guild;
  }

  /** Stops reading the plot, as the player leaves. */
  stop(): void {
    clearInterval(this.timer);
    letGo();
    removeEventListener(OUTPOST_CHANGED, this.look);
    removeEventListener(OUTPOST_DELVE, this.delveAsked);
    this.asked++;
  }
}

/** An outpost site's outpost, read for the guild whose outpost's room was joined, walled in the page's movement and
 *  fight beside the node's own boxes, the plot read again as the room `heard` says it stood another; none at any
 *  other node. */
export function outpostAt(
  node: NodeInfo,
  opened: Pick<Opened, 'boxes' | 'outpost'>,
  context: Pick<FootContext, 'movement' | 'trips'>,
  fight: Course,
  heard: { readonly plots: number },
): OutpostHere | null {
  if (node.kind !== 'outpost') return null;
  const { movement, trips } = context;
  const ground = groundOf(node, (x, y) => movement.standing(x, y).z);
  const course = { boxes: opened.boxes, courses: [movement, fight] };
  const delve = trips.enterDelve?.bind(trips);
  return new OutpostHere(node.id, ground, accountsHeld(), course, delve, opened.outpost ?? undefined, heard);
}
