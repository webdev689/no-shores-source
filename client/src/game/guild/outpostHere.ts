import type { EventProp } from '../../city/eventProps.ts';
import type { AccountLink, OutpostSeen } from '../../network/accounts.ts';
import { ASKS, type GearAsk } from '../../network/gearMessages.ts';
import type { Block } from '../../rules/movementRules.ts';
import type { Use } from '../footGear.ts';
import { OUTPOST_CHANGED, openGearWindow } from '../gearScreen.ts';
import { bannerFrom, bannerOfName } from './bannerLaw.ts';
import { nodeRoom } from '../rooms.ts';
import type { NodeInfo } from '../worldData.ts';
import { accountsHeld, guildHeld } from './guildHeld.ts';
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

/** A placed module as a prop standing whole. */
const propOf = (placed: Placed): EventProp => ({ ...placed, scale: 1, rise: 1, lid: 0, glow: 1 });

/** The staff a guild's banner hangs from, as kept. */
function staffOf(seen: OutpostSeen): string {
  try {
    return (bannerFrom(JSON.parse(seen.banner)) ?? bannerOfName(seen.name)).staff;
  } catch {
    return bannerOfName(seen.name).staff;
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
  private readonly timer: ReturnType<typeof setInterval>;

  readonly site: string;
  private readonly ground: Ground;
  private readonly link: AccountLink | null;
  private readonly course: { readonly boxes: readonly Block[]; readonly courses: readonly Course[] };

  constructor(
    site: string,
    ground: Ground,
    link: AccountLink | null,
    course: { readonly boxes: readonly Block[]; readonly courses: readonly Course[] },
  ) {
    [this.site, this.ground, this.link, this.course] = [site, ground, link, course];
    this.shown = this.standing();
    this.look();
    this.timer = setInterval(this.look, LOOK_MS);
    addEventListener(OUTPOST_CHANGED, this.look);
  }

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
    void guildHeld()
      .then((guild) => link.outpost(nodeRoom({ id: this.site, kind: 'outpost' }, 'normal', guild?.key ?? null)))
      .then((answer) => {
        if (asked !== this.asked || typeof answer === 'string') return;
        this.take(answer.outpost);
      })
      .catch(() => undefined);
  };

  /** Stands an outpost as read (null for none raised). */
  take(seen: OutpostSeen | null): void {
    this.seen = seen;
    this.shown = this.standing();
    const plot = seen ? plotBoxes(seen.plot, this.ground, staffOf(seen)) : [];
    for (const course of this.course.courses) course.setCourse([...this.course.boxes, ...plot]);
  }

  /** The props the outpost stands as beside `besides` (the zone's own), kept as one list while nothing changes. */
  props(besides: readonly EventProp[] = []): readonly EventProp[] {
    return besides.length === 0 ? this.shown : [...besides, ...this.shown];
  }

  /** Every prop the outpost stands as: each structure and piece of decoration, or the post while it is bare. */
  private standing(): EventProp[] {
    const { seen, ground } = this;
    if (!seen) {
      const [x, y] = socketOf(HALL, ground, '', 'use');
      return [propOf({ module: 'lamp-post', at: [x, y, ground.level], turn: 0 })];
    }
    const staff = staffOf(seen);
    return [
      ...seen.plot.structures.map((standing) => propOf(placeOf(standing, ground, staff))),
      ...seen.plot.decor.map((decor) => propOf(decorPlaceOf(decor, ground))),
    ];
  }

  /** What E does at (`x`, `y`): opens the Guild tab on the structure whose socket is near, takes up a piece of
   *  decoration, or, while the outpost is bare, says how to raise it. */
  readonly uses = (x: number, y: number, ask: (asked: GearAsk) => void): Use | null => {
    const { seen, ground, site } = this;
    const near = ([atX, atY]: readonly [number, number] | readonly number[]) =>
      Math.hypot((atX ?? 0) - x, (atY ?? 0) - y) <= REACH_M;
    if (!seen) {
      const post = socketOf(HALL, ground, '', 'use');
      return near(post)
        ? { words: RAISE_WORDS, run: () => openGearWindow({ view: 'guild', outpost: { site } }) }
        : null;
    }
    const staff = staffOf(seen);
    for (const standing of seen.plot.structures) {
      if (!near(socketOf(standing, ground, staff, socketNameOf(standing.kind)))) continue;
      const outpost = { site, structure: standing.id };
      return { words: useWords(standing), run: () => openGearWindow({ view: 'guild', outpost }) };
    }
    const piece = seen.plot.decor.find((decor) => near(decorPlaceOf(decor, ground).at));
    if (!piece || !this.link) return null;
    const link = this.link;
    const run = () =>
      void link.social('outpost/undecorate', { site, id: piece.id }).then((why) => {
        if (why !== null) return;
        ask({ kind: ASKS.outpostChanged });
        dispatchEvent(new Event(OUTPOST_CHANGED));
      });
    return { words: `Take up the ${pieceOf(piece.piece)?.name ?? 'decoration'}`, run };
  };

  /** Stops reading the plot, as the player leaves. */
  stop(): void {
    clearInterval(this.timer);
    removeEventListener(OUTPOST_CHANGED, this.look);
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
): OutpostHere {
  const ground = groundOf(node, (x, y) => movement.standing(x, y).z);
  return new OutpostHere(node.id, ground, accountsHeld(), { boxes, courses: [movement, fight] });
}
