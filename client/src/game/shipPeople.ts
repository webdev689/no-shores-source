// The people seen aboard every other ship drawn: its captain at its wheel facing forward, in the look its faction and
// rank give it, and its hands going about its deck in its crew's dress, walking and pausing as the player's own hands
// do, some at its guns while a side stands run out. Each stands where its deck lies on the swell, drawn as large as
// its ship is. Only figures near enough to stand a few pixels tall on the picture are drawn, the nearest first and no
// more than a frame affords; a ship whose drawing tells no crew carries none.
import type { CardAt, Cards } from '../player/cards.ts';
import type { Dress } from '../player/dressing.ts';
import { cardStand, frameAt, viewOf } from '../player/figures.ts';
import type { SideName } from '../rules/fightRules.ts';
import type { FoeType } from '../rules/roster.ts';
import { cellHeight, type Deck, deckToWorld, HULL_DECKS, type Lying, SLOOP_DECK, worldToDeck } from '../ships/deck.ts';
import { hullGuns } from '../ships/hulls.ts';
import { captainStands, HANDS_BY_HULL, handsShown, type ShipCrew } from '../ships/shipCrew.ts';
import type { ShipPlace } from '../ships/shipView.ts';
import type { Shot } from './camera.ts';
import { clearLeg, Crew, type Post } from './crew.ts';
import { rosterFor } from './footRoom.ts';
import { type Company, companyOf } from './shipCompany.ts';

/** A figure stands about this tall, metres; it is drawn only while it stands this many pixels tall on the picture. */
const FIGURE_M = 1.8;
const FEWEST_PX = 4;
/** The most figures drawn aboard other ships in a frame: the nearest are kept. */
export const MOST_ABOARD = 40;
/** A captain whose colours are struck stands about this far off its wheel, metres, on the wheel's own level (within
 *  this much of its height). */
const ASIDE_M = 1.2;
const LEVEL_M = 0.25;
/** A hand serving a gun stands this far inboard of its mouth, metres, behind its carriage. */
const AT_GUN_M = 1.6;
/** Their moves loop at this many frames a second, as the player's own hands' do; each keeps a clock this far from the
 *  last one's, seconds, so no two keep step. */
const LOOP_FPS = 6;
const APART_S = 0.37;
/** Each ship's figures are numbered in a block of their own, never used twice in the page's life: the forge keeps a
 *  figure's last card by its number. */
const IDS_A_SHIP = 16;
let nextIds = 2_000_000;

/** A ship as drawn: its hull, where it lies, and who is aboard where its drawing tells it. */
export interface Manned {
  readonly hull: number;
  readonly place: ShipPlace;
  readonly crew?: ShipCrew | undefined;
}

/** One figure aboard a ship: its number for the forge, its dress and move, where it stands (its deck's frame) and the
 *  way it faces there, how its ship lies, where that puts it in the world and how far it stands from the eye. */
export interface Aboard {
  readonly id: number;
  readonly dress: Dress;
  readonly anim: 'idle' | 'walk';
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly facing: number;
  readonly lying: Lying;
  readonly world: readonly [number, number, number];
  readonly away: number;
}

/** How far off a figure aboard a ship drawn `scale` times its size still stands `FEWEST_PX` tall, metres, on a
 *  picture `heightPx` tall whose vertical field is `fov` radians. */
export function figureReach(fov: number, heightPx: number, scale: number): number {
  return (FIGURE_M * scale * heightPx) / (2 * Math.tan(fov / 2) * FEWEST_PX);
}

/** How a ship lies as its drawing places it. */
export const lyingOf = (place: ShipPlace): Lying => ({
  x: place.x,
  y: place.y,
  heading: place.heading,
  scale: place.scale ?? 1,
  heave: place.z,
  pitch: place.pitch,
  roll: place.roll,
});

/** A ship's own number from its name, so each walks its hands its own way. */
function seedOf(key: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index++) hash = Math.imul(hash ^ key.charCodeAt(index), 0x01000193);
  return (hash >>> 0) % 1_000_003;
}

/** Where a hand stands to serve each gun of a hull's walked deck, by side, fore to aft: inboard of its mouth, facing
 *  out over that side. A gun whose mouth stands under that deck is a lower gun deck's, and left out. */
const postsByHull = new Map<number, Readonly<Record<SideName, readonly Post[]>>>();
function gunPosts(hull: number, deck: Deck): Readonly<Record<SideName, readonly Post[]>> {
  const known = postsByHull.get(hull);
  if (known) return known;
  const posts: Record<SideName, Post[]> = { port: [], starboard: [] };
  for (const { side, mouth } of hullGuns(hull)) {
    const out = side === 'starboard' ? 1 : -1;
    const [x, y] = [mouth[1] - out * AT_GUN_M, -mouth[0]];
    const z = cellHeight(deck, x, y);
    if (z !== null && z <= mouth[2]) posts[side].push({ x, y, z, facing: (out * Math.PI) / 2 });
  }
  postsByHull.set(hull, posts);
  return posts;
}

/** The hands at their guns while sides stand run out: half of those shown, rounded up, one a gun, the sides taken in
 *  turn fore to aft; none while it does not fight on. */
function postsFor(hull: number, deck: Deck, crew: ShipCrew, shown: number): (Post | null)[] {
  if (crew.state !== 'afloat' || !crew.runOut?.length) return [];
  const bySide = gunPosts(hull, deck);
  const sides = crew.runOut.map((side) => bySide[side]);
  const most = Math.max(0, ...sides.map((posts) => posts.length));
  const guns = Array.from({ length: most }, (_unused, nth) => sides.flatMap((posts) => posts[nth] ?? [])).flat();
  return guns.slice(0, Math.ceil(shown / 2));
}

/** Where a captain stands on a deck, as their ship's state has them: behind its wheel facing its bow; or, struck, off
 *  it on the wheel's own level, the spot a clear step away nearest one to port and a little forward of it, looking out
 *  the way they stepped. Found once a deck. */
const asideOf = new WeakMap<Deck, Post>();
function captainSpot(deck: Deck, stands: 'wheel' | 'aside'): Post {
  const [helmX, helmY] = deck.helm;
  const helmZ = cellHeight(deck, helmX, helmY) ?? 0;
  const wheel = { x: helmX, y: helmY, z: helmZ, facing: 0 };
  if (stands === 'wheel') return wheel;
  const known = asideOf.get(deck);
  if (known) return known;
  const [wantX, wantY] = [helmX - ASIDE_M, helmY - ASIDE_M / 2];
  let best: Post = wheel;
  let bestOff = Infinity;
  const reach = Math.ceil((2 * ASIDE_M) / deck.cell);
  for (let across = -reach; across <= reach; across++)
    for (let along = -reach; along <= reach; along++) {
      const [x, y] = [helmX + across * deck.cell, helmY + along * deck.cell];
      const z = cellHeight(deck, x, y);
      const out = Math.hypot(x - helmX, y - helmY);
      if (z === null || Math.abs(z - helmZ) > LEVEL_M || out < ASIDE_M * 0.8 || out > ASIDE_M * 2) continue;
      const off = Math.hypot(x - wantX, y - wantY);
      if (off < bestOff && clearLeg(deck, [helmX, helmY], [x, y]))
        [best, bestOff] = [{ x, y, z, facing: Math.atan2(x - helmX, -(y - helmY)) }, off];
    }
  asideOf.set(deck, best);
  return best;
}

/** A ship's people between frames: its hull, its hands' walks, the first of its figures' numbers, and who they are,
 *  for the faction and rank they were dressed for. */
interface Kept {
  readonly hull: number;
  readonly crew: Crew;
  readonly firstId: number;
  readonly company: Company;
  readonly dressedFor: string;
}

/** Every other ship's people, dressed from the rules in `module` and drawn by `forge`. */
export const shipPeopleOf = (module: Promise<WebAssembly.Module>, forge: Pick<Cards, 'card' | 'frames' | 'forget'>) =>
  new ShipPeople(rosterFor(module), forge);

/** Every other ship's people, kept from frame to frame so its hands walk on. */
export class ShipPeople {
  private roster: readonly FoeType[] | null = null;
  private readonly forge: Pick<Cards, 'card' | 'frames' | 'forget'>;
  private readonly kept = new Map<string, Kept>();

  /** Dressed from the rules' `roster` (a captain's ship carries none until it is read), drawn by `forge`. */
  constructor(
    roster: readonly FoeType[] | Promise<readonly FoeType[]>,
    forge: Pick<Cards, 'card' | 'frames' | 'forget'>,
  ) {
    this.forge = forge;
    if (roster instanceof Promise)
      roster.then(
        (read) => (this.roster = read),
        () => undefined,
      );
    else this.roster = roster;
  }

  /** The ship `crew` names, of `hull`, as it was last kept; new, or its hull or its look changed, made again. */
  private keep(crew: ShipCrew, hull: number): Kept | null {
    const dressedFor = `${crew.faction}:${crew.rank}`;
    const last = this.kept.get(crew.key);
    if (last?.hull === hull && last.dressedFor === dressedFor) return last;
    if (crew.faction > 0 && !this.roster) return null;
    const deck = HULL_DECKS[hull] ?? SLOOP_DECK;
    const firstId = last?.firstId ?? nextIds;
    if (!last) nextIds += IDS_A_SHIP;
    const company = companyOf(this.roster ?? [], crew.faction, crew.rank);
    const kept = {
      hull,
      crew: new Crew(deck, seedOf(crew.key), HANDS_BY_HULL[hull] ?? 0),
      firstId,
      company,
      dressedFor,
    };
    this.kept.set(crew.key, kept);
    return kept;
  }

  /** Everyone aboard `ships` an eye at `eye` sees within `reach` of it (metres, for a ship drawn at a scale), their
   *  hands walked on `seconds`: the nearest first, at most `MOST_ABOARD`. A ship gone from `ships` is let go. */
  aboard(
    ships: readonly Manned[],
    eye: readonly [number, number, number],
    reach: (scale: number) => number,
    seconds: number,
  ): Aboard[] {
    const seen = new Set<string>();
    const people: Aboard[] = [];
    for (const { hull, place, crew } of ships) {
      if (!crew) continue;
      seen.add(crew.key);
      const lying = lyingOf(place);
      const deck = HULL_DECKS[hull] ?? SLOOP_DECK;
      const halfLength = ((deck.rows * deck.cell) / 2) * lying.scale;
      const far = reach(lying.scale);
      if (Math.hypot(eye[0] - lying.x, eye[1] - lying.y, eye[2] - lying.heave) - halfLength > far) continue;
      const kept = this.keep(crew, hull);
      if (!kept) continue;
      const shown = handsShown(hull, crew);
      kept.crew.step(seconds, postsFor(hull, deck, crew, shown));
      const stand = (id: number, dress: Dress | null | undefined, anim: Aboard['anim'], spot: Post) => {
        const world = deckToWorld(lying, spot.x, spot.y, spot.z);
        const away = Math.hypot(world[0] - eye[0], world[1] - eye[1], world[2] - eye[2]);
        const { x, y, z, facing } = spot;
        if (dress && away <= far) people.push({ id, dress, anim, x, y, z, facing, lying, world, away });
      };
      const stands = captainStands(crew);
      if (stands) stand(kept.firstId, kept.company.captain, 'idle', captainSpot(deck, stands));
      const { hands } = kept.company;
      kept.crew.hands.slice(0, shown).forEach((hand, index) => {
        const dress = hands[index % Math.max(1, hands.length)];
        stand(kept.firstId + 1 + index, dress, hand.walking ? 'walk' : 'idle', hand);
      });
    }
    for (const [key, kept] of this.kept) {
      if (seen.has(key)) continue;
      for (let id = kept.firstId; id < kept.firstId + IDS_A_SHIP; id++) this.forge.forget(id);
      this.kept.delete(key);
    }
    return people.sort((one, other) => one.away - other.away).slice(0, MOST_ABOARD);
  }

  /** The cards of everyone aboard `ships` seen through `shot` on a picture `heightPx` tall (CSS pixels), their hands
   *  walked on `seconds`, their moves at `clock`. */
  cards(
    ships: readonly Manned[],
    shot: Pick<Shot, 'eye' | 'fov'>,
    heightPx: number,
    seconds: number,
    clock: number,
  ): CardAt[] {
    const reach = (scale: number) => figureReach(shot.fov, heightPx, scale);
    return this.aboard(ships, shot.eye, reach, seconds).flatMap((person) => {
      const [eyeX, eyeY] = worldToDeck(person.lying, ...shot.eye);
      const { view, flip } = viewOf(person.facing, person.x, person.y, eyeX, eyeY);
      const since = clock + (person.id % IDS_A_SHIP) * APART_S;
      const frame = frameAt(since, this.forge.frames(person.dress.body, person.anim), LOOP_FPS);
      const card = this.forge.card(person.id, person.dress, person.anim, view, frame, flip);
      if (!card) return [];
      const stand = cardStand(person.x, person.y, eyeX, eyeY);
      const [x, y, z] = deckToWorld(person.lying, stand.x, stand.y, person.z);
      return [{ card, x, y, z, flip, scale: person.lying.scale }];
    });
  }
}
