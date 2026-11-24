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
import { accountsHeld, guildHeld } from './guildHeld.ts';
import { ridAnswered, withRid } from './outpostAsks.ts';
import { kindOf, pieceOf, type Plot, type Standing } from './outpostLaw.ts';
import { type Ground, type Placed, decorPlaceOf, placeOf, plotBoxes, socketOf } from './outpostPlaces.ts';

/**
 * An outpost as the page stands it in its room: the plot read from the accounts on arriving, whenever the player
 * changes it, and every so often while there; each structure and piece of decoration drawn as a prop where the plot's
 * reckoning stands it, the same boxes walled in the page's own movement and fight as the room walls, and what E does
 * at each. A wild site, or one whose outpost is not raised, is bare ground with a post where the hall would stand.
 */

/** How often the plot is read again while the player is there. */
const LOOK_MS = 15_000;
/** How near a structure's socket, or a piece of decoration, E reaches, metres. */
const REACH_M = 2.5;
/** How far before the player a piece being placed stands, past its own reach. */
const AHEAD_M = 1;
const GHOST_GREEN = [0.25, 0.85, 0.35] as const;
const GHOST_RED = [0.9, 0.2, 0.15] as const;
const RAISE_WORDS = "Raise your guild's outpost here from the Guild tab.";
/** Where the hall stands once raised (`server/accounts/outposts.ts`), the post standing at its door while bare. */
const HALL: Standing = { id: 0, kind: 'hall', tier: 1, building: 0, x: 6, y: 6, turn: 0 };

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

/** What using a structure offers: delivering while it is built, the horn sounded, or its name. */
export function useWords(standing: Standing): string {
  const kind = kindOf(standing.kind);
  if (!kind) return '';
  if (standing.building > 0) return 'Deliver materials';
  if (kind.id === 'horn') return 'Sound the War Horn';
  return kind.name;
}

/** How far out before the gate's door the outpost's room stands a player come back out (`Room::join_at`). */
const OUT_OF_GATE_M = 1.5;

/** A placed module as a prop standing whole. */
const propOf = (placed: Placed): EventProp => ({ ...placed, scale: 1, rise: 1, lid: 0, glow: 1 });

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
  /** The room this page joined here, named by the guild's key as it stood on arriving. */
  private readonly room: Promise<string>;
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

  constructor(
    site: string,
    ground: Ground,
    link: AccountLink | null,
    course: { readonly boxes: readonly Block[]; readonly courses: readonly Course[] },
    delve: Trips['enterDelve'] = undefined,
  ) {
    [this.site, this.ground, this.link, this.course, this.delve] = [site, ground, link, course, delve];
    this.room = guildHeld().then((guild) => nodeRoom({ id: site, kind: 'outpost' }, 'normal', guild?.key ?? null));
    this.shown = this.standing();
    this.look();
    this.timer = setInterval(this.look, LOOK_MS);
    addEventListener(OUTPOST_CHANGED, this.look);
    addEventListener(OUTPOST_DELVE, this.delveAsked);
  }

  /** The guild dungeon at `tier` (0 Normal to 2 Abyss), where the gate stands at it or higher: in by the page's trips,
   *  out before the gate's door, facing away from it. */
  private delveAt(tier: number): void {
    const { seen, ground } = this;
    const gate = seen ? gateOf(seen.plot) : null;
    const top = seen ? gateTier(seen.plot) : null;
    if (!seen || !gate || top === null || tier < 0 || tier > top) return;
    const facing = Math.PI + (gate.turn * Math.PI) / 2;
    const [doorX, doorY] = socketOf(gate, ground, this.staff, 'door');
    const out = { x: doorX + Math.sin(facing) * OUT_OF_GATE_M, y: doorY - Math.cos(facing) * OUT_OF_GATE_M, facing };
    this.delve?.(seen.guild.replaceAll('-', '').toLowerCase(), tier, out);
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
    void this.room
      .then((room) => link.outpost(room))
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
    if (ghost) return [...besides, ...this.shown, ghost];
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
    if (!placed || !this.link) return null;
    const { placing, decor, refusal, name } = placed;
    const link = this.link;
    const spot = `${decor.x},${decor.y},${decor.turn}`;
    // The accounts' last refusal shows only while the piece stands where it was refused.
    if (placing.said !== null && placing.saidAt !== spot) placing.said = null;
    const run = () => {
      if (refusal !== null || placing.sending) return;
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
      const [x, y] = socketOf(HALL, ground, '', 'use');
      return [propOf({ module: 'lamp-post', at: [x, y, ground.level], turn: 0 })];
    }
    const { staff } = this;
    return [
      ...seen.plot.structures.map((standing) => propOf(placeOf(standing, ground, staff))),
      ...seen.plot.decor.map((decor) => propOf(decorPlaceOf(decor, ground))),
    ];
  }

  /** What E does at (`x`, `y`): opens the Guild tab on the structure whose socket is near, takes up a piece of
   *  decoration, or, while the outpost is bare, says how to raise it. */
  readonly uses = (x: number, y: number, ask: (asked: GearAsk) => void, facing = this.facing): Use | null => {
    this.facing = facing;
    const placing = this.place([x, y], ask);
    if (placing) return placing;
    const { seen, ground, site } = this;
    const near = ([atX, atY]: readonly [number, number] | readonly number[]) =>
      Math.hypot((atX ?? 0) - x, (atY ?? 0) - y) <= REACH_M;
    if (!seen) {
      const post = socketOf(HALL, ground, '', 'use');
      return near(post)
        ? { words: RAISE_WORDS, run: () => openGearWindow({ view: 'guild', outpost: { site } }) }
        : null;
    }
    const { staff } = this;
    const top = gateTier(seen.plot);
    for (const standing of seen.plot.structures) {
      if (!near(socketOf(standing, ground, staff, socketNameOf(standing.kind)))) continue;
      // A gate standing goes down at its highest tier; a lower one is chosen on the Guild tab.
      if (standing.kind === 'gate' && standing.building === 0 && top !== null && this.delve)
        return { words: `Delve: ${DELVE_WORDS[top] ?? ''}`, run: () => this.delveAt(top) };
      const outpost = { site, structure: standing.id };
      return { words: useWords(standing), run: () => openGearWindow({ view: 'guild', outpost }) };
    }
    const piece = seen.plot.decor.find((decor) => near(decorPlaceOf(decor, ground).at));
    if (!piece || !this.link) return null;
    const link = this.link;
    const run = () => {
      const sent = withRid('outpost/undecorate', { site, id: piece.id });
      void link.social('outpost/undecorate', sent).then((why) => {
        this.takenUp = why === null ? null : { id: piece.id, why };
        if (why !== null) return;
        ridAnswered(sent);
        ask({ kind: ASKS.outpostChanged });
        dispatchEvent(new Event(OUTPOST_CHANGED));
      });
    };
    // A refusal (a member below admin) is said where the piece stands, as the use prompt's words.
    const refused = this.takenUp?.id === piece.id ? this.takenUp.why : null;
    return { words: refused ?? `Take up the ${pieceOf(piece.piece)?.name ?? 'decoration'}`, run };
  };

  /** Stops reading the plot, as the player leaves. */
  stop(): void {
    clearInterval(this.timer);
    letGo();
    removeEventListener(OUTPOST_CHANGED, this.look);
    removeEventListener(OUTPOST_DELVE, this.delveAsked);
    this.asked++;
  }
}

/** An outpost site's outpost, read for the player's guild, walled in the page's movement and fight beside the node's
 *  own `boxes`. */
export function outpostAt(
  node: NodeInfo,
  boxes: readonly Block[],
  movement: Course & { standing(x: number, y: number): { readonly z: number } },
  fight: Course,
  delve?: Trips['enterDelve'],
): OutpostHere {
  const ground = groundOf(node, (x, y) => movement.standing(x, y).z);
  return new OutpostHere(node.id, ground, accountsHeld(), { boxes, courses: [movement, fight] }, delve);
}
