// The sea's clicks and the landings they ask after: a click on the sea sails (in the Oversea view), on a hostile
// ship's mark chases it, and on a port's icon, its island, a coast with no port or one of the sea's islands asks the
// player to confirm the landing. Yes docks in sight where the ship lies within reach and nothing else holds the player
// (a sea island's anchorage always): the ship sails in to its berth, seen from the Oversea view, and lands once it
// lies there; else it makes for the landing and docks once it can. A fight or another course lets a landing made for
// go, on the coast and on a sea island alike; the player leaving the sea lets its voyage go with it. Back at sea, a
// ship docked sails out from its berth. A port's card offers its repair too, asked once the ship lies at rest by the
// port's roadstead. And the confirmation's card, in the middle of the view.
import type { Point2 } from '../overworld/ground.ts';
import { coastPoint } from '../overworld/islandView.ts';
import { nearestRegion, regionWords } from '../overworld/regions.ts';
import type { Pick as Picked } from '../overworld/overworldPick.ts';
import type { Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { noKey, withKey } from './controls.ts';
import { DIM } from './hudPieces.ts';
import { footer, header, hudPress, said } from './hudParts.ts';
import { ISLANDS } from './hudLaw.ts';
import { berthOf } from './berths.ts';
import { type Berthed, Docking } from './docking.ts';
import { isleWords } from './isleLaw.ts';
import type { IsleHeld, Isles } from './isles.ts';
import {
  askWords,
  type ClickContext,
  clickAtSea,
  inReach,
  LandingCourse,
  type LandingAim,
  landingOn,
  RepairCourse,
} from './landingAsk.ts';
import type { Landmass } from './landmass.ts';
import { portOf } from './nodes.ts';
import type { Sea } from './sea.ts';
import type { Landfall } from './seaLaw.ts';
import type { PortRepairs, RepairOffer } from './seaWord.ts';

/** How far past a sea island's coast a click on the water still means the island, metres. */
const ISLE_CLICK_M = 400;

/** The confirmation standing: the landing asked after, and whether the ship lies within reach of it now. */
export interface Asking {
  readonly aim: LandingAim;
  readonly near: boolean;
}

/** What the landings reach: the sea, the open landmass and the sea's islands; whether the player may be taken
 *  elsewhere now; what lands on the open landmass, asked only while the player is free: the view flown up over the
 *  island the ship lies off, to choose where, answering whether it was; and the repair a port's card offers now, with
 *  where it is had (none before the sea's rules are read). */
export interface LandingsGame {
  readonly sea: () => Sea | null;
  readonly repairs: () => PortRepairs | null;
  readonly landmass: () => Pick<Landmass, 'id' | 'plan' | 'outline' | 'heightAt' | 'regions'>;
  readonly isles: Isles;
  readonly free: () => boolean;
  readonly land: (aim: LandingAim) => boolean;
}

/** What a click is judged against: the open landmass's living port, its coast's name, its regions, and the sea's
 *  islands built. */
export function clickContext(
  landmass: Pick<Landmass, 'id' | 'plan' | 'regions' | 'outline'>,
  isles: Pick<Isles, 'all'>,
): ClickContext {
  const port = portOf(landmass.plan);
  const coast = ISLANDS[landmass.id] ?? landmass.plan?.name ?? 'this coast';
  const regions = landmass.regions ?? [];
  const portRegion = port ? nearestRegion(regions, port.harbour) : null;
  return {
    port: port && landmass.plan ? { id: `${landmass.plan.id}-port`, name: port.name, harbour: port.harbour } : null,
    coast,
    isleAt: (point) => {
      const isle = isles.all().find(({ seen, built }) => {
        const away = Math.hypot(seen.at[0] - point[0], seen.at[1] - point[1]);
        return built !== null && away <= built.reach + ISLE_CLICK_M;
      });
      return isle ? { id: isle.seen.id, words: isleWords(isle.seen) } : null;
    },
    // Judged where the ship would come in, the coast nearest the point, as the landing it asks is made there.
    regionOf: (point) => {
      const region = regions.length ? nearestRegion(regions, coastPoint(point, landmass.outline)) : null;
      return region && { coast: regionWords(region.name), port: region === portRegion };
    },
  };
}

/** The landing the sea offers where the ship lies, as the key that asks it (L) asks: none out of reach. */
export function aimOf(landfall: Landfall, here: ClickContext, ship: Point2): LandingAim | null {
  if (!landfall) return null;
  if (landfall.kind === 'isle') return { kind: 'isle', id: landfall.id, words: landfall.words };
  if (landfall.kind === 'dock' && here.port) return { kind: 'dock', port: here.port.name, harbour: here.port.harbour };
  // Cut into regions, the region the ship lies off is landed on as a click on its land would be.
  return here.regionOf(ship) ? landingOn(here, ship) : { kind: 'ashore', coast: here.coast, toward: ship };
}

/** The room's word on the ship for its repair: once it has taken the last course sent, or with no voyage, as it last
 *  moved it (no course sent since joining leaves `settledShip` none). */
function roomsShip(sea: Sea): { readonly x: number; readonly y: number; readonly pace: number } | null {
  return sea.sighted?.settledShip ?? (sea.bound === null ? (sea.sighted?.ownShip ?? null) : null);
}

/** The sea's clicks and the landings they ask after, answered, made for and docked in sight: on the open landmass's
 *  coast, and on a sea island. */
export class SeaLandings {
  /** The confirmation standing, if any. */
  asking: Asking | null = null;
  private readonly course = new LandingCourse();
  private readonly docking = new Docking();
  private readonly mending = new RepairCourse();
  private readonly game: LandingsGame;
  /** Whether the player was at sea last frame, so coming back to it is seen. */
  private wasAtSea = false;

  constructor(game: LandingsGame) {
    this.game = game;
  }

  /** A click at sea that met `pick`: sails, chases or asks; a new click puts by a question still standing. */
  click(pick: Picked): void {
    const sea = this.game.sea();
    if (!sea) return;
    this.asking = null;
    const click = clickAtSea(pick, sea.level, clickContext(this.game.landmass(), this.game.isles));
    if (click?.kind === 'ask') this.ask(click.aim);
    else if (click) {
      this.letGo();
      if (click.kind === 'sail') sea.sailTo(click.point);
      else sea.sailToMark(click.id);
    }
  }

  /** Asks after the landing the sea offers where the ship lies (the key L); nothing out of reach. */
  askHere(): void {
    const sea = this.game.sea();
    const aim = sea && aimOf(sea.landfall, clickContext(this.game.landmass(), this.game.isles), sea.position);
    if (aim) this.ask(aim);
  }

  private ask(aim: LandingAim): void {
    const sea = this.game.sea();
    if (sea) this.asking = { aim, near: inReach(aim, sea.landfall) };
  }

  /** The confirmation answered: yes docks in sight within reach while nothing else holds the player (at a sea island
   *  always), else makes for it (the coast nearest a point clicked inland); no lets it go. */
  answer(yes: boolean): void {
    const [asked, sea] = [this.asking, this.game.sea()];
    this.asking = null;
    if (!yes || !asked || !sea) return;
    const { aim } = asked;
    this.letGo();
    const near = inReach(aim, sea.landfall);
    if (aim.kind === 'isle' || (near && this.game.free())) return this.dock(sea, aim);
    const to = aim.kind === 'dock' ? aim.harbour : coastPoint(aim.toward, this.game.landmass().outline);
    if (!near) sea.sailTo(to);
    this.course.begin(aim, to);
  }

  /** A port's card answered Repair Ship: where the room has the ship lying at rest within reach of the port's
   *  roadstead it asks the repair now, else sails for the roadstead and asks it once there. A repair that cannot be
   *  had does nothing, the card standing to say why. */
  repair(): void {
    const [asked, sea, repairs] = [this.asking, this.game.sea(), this.game.repairs()];
    if (asked?.aim.kind !== 'dock' || !sea || !repairs || repairs.offer.why) return;
    const { harbour } = asked.aim;
    const off = (point: Point2) => Math.hypot(point[0] - harbour[0], point[1] - harbour[1]);
    const roadstead = repairs.roadsteads.reduce<Point2 | null>(
      (near, each) => (near && off(near) <= off(each) ? near : each),
      null,
    );
    if (!roadstead) return;
    this.asking = null;
    this.letGo();
    this.mending.begin(roadstead);
    if (this.mending.due(roomsShip(sea), sea.bound, repairs.reachM)) return sea.sighted?.ask('repair');
    sea.sailTo(roadstead);
    this.mending.begin(roadstead);
  }

  /** The repair a port's card offers now; none before the sea's rules are read. */
  get repairOffer(): RepairOffer | null {
    return this.game.repairs()?.offer ?? null;
  }

  /** Docks in sight: the ship sails in to the landing's berth, among the ships the sea shows, from the Oversea view;
   *  with no way in, nothing is made for, the view stays as it was, and the voyage's line says why. */
  private dock(sea: Sea, aim: LandingAim): void {
    const [landmass, ships] = [this.game.landmass(), sea.sighted?.others ?? []];
    const berth = berthOf(aim, landmass, this.game.isles.all(), ships);
    if (berth) this.docking.begin(sea, { aim, berth, landmass: landmass.id });
  }

  /** The landing being made for, if any, as the ship's panel names where it is bound. */
  get making(): LandingAim | null {
    return this.course.making ?? this.docking.making;
  }

  /** Lets any landing or repair made for go: another course set, a fight, or the player washed up or gone from the
   *  sea. */
  letGo(): void {
    this.course.cancel();
    this.docking.cancel();
    this.mending.cancel();
  }

  /** Where the ship lies docked, if it does, until it sails out again. */
  get docked(): Berthed | null {
    return this.docking.docked;
  }

  /** The sea island the ship has come to anchor off for its landing, taken once, the landing given up if the island no
   *  longer stands; asked only while nothing else holds the player. */
  anchored(): IsleHeld | null {
    const [sea, making] = [this.game.sea(), this.docking.making];
    if (!sea || making?.kind !== 'isle') return null;
    const held = this.game.isles.byId(making.id);
    if (!held || !this.game.isles.all().some(({ seen, built }) => seen.id === making.id && built)) {
      this.docking.cancel();
      return null;
    }
    return this.docking.arrived(sea) && held;
  }

  /** Each frame: the question put by once the player is not `atSea` or the ship's view is not theirs to answer it
   *  from, a landing made for let go in a fight or once the player has left the ship, its voyage with it. Back at sea
   *  (aboard again, or back from the island's tiles), out of a fight and with the helm theirs, a ship docked sails out
   *  once placed. And from the view over the ship, while nothing else holds the player, a landing on the coast docked
   *  in sight once the ship lies within reach of it, and made once the ship lies at its berth and the view lands it. */
  frame(atSea = true): void {
    const sea = this.game.sea();
    const back = atSea && !this.wasAtSea;
    this.wasAtSea = atSea;
    if (!atSea) {
      this.asking = null;
      // Leaving the ship mid-trip forgets the trip: nothing sails on to the berth once the player is back aboard.
      if (this.making) sea?.passage.letGo();
      this.letGo();
    }
    if (!sea || !atSea) return;
    if (back) this.docking.cameAboard();
    if (sea.fight) this.letGo();
    const repairs = this.mending.waiting ? this.game.repairs() : null;
    if (repairs && this.mending.due(roomsShip(sea), sea.bound, repairs.reachM)) sea.sighted?.ask('repair');
    if (sea.fight || sea.view.kind !== 'sail' || sea.busy) this.asking = null;
    if (sea.fight || !this.game.free()) return;
    this.docking.undock(sea);
    // The switch to the Oversea view and the flight up over the island are made from the view over the ship alone.
    if (sea.view.kind !== 'sail') return;
    // What the sea offers is asked only while a landing on the coast is made for.
    const due = this.course.making && this.course.due(sea.landfall, sea.bound);
    if (due) this.dock(sea, due);
    // A sea island's landing walks ashore (`anchored`); one on the coast flies the view up over the island.
    if (this.docking.making?.kind !== 'isle') this.docking.arrived(sea, (aim) => this.game.land(aim));
  }
}

/** The repair a port's card offers, and what pressing it does. */
export interface CardRepair {
  readonly offer: RepairOffer;
  readonly mend: () => void;
}

/** The confirmation a little above the middle of the view, clear of the ship's console under it: its question in brass,
 *  what yes does, and its presses. A port's offers Dock with Enter, Repair Ship (`repair`, its price named, or why it
 *  cannot be had, shown but doing nothing) with the repair's key, and Leave with Escape; another landing's no with
 *  Escape and yes with Enter. */
export function landingAskNode(
  ui: Interface,
  asking: Asking,
  answer: (yes: boolean) => void,
  repair: CardRepair | null = null,
): Node {
  const words = askWords(asking.aim, asking.near);
  const port = asking.aim.kind === 'dock';
  const yes = hudPress(ui, 'sea:ask-yes', withKey(words.yes, 'confirm'), () => answer(true), { role: 'primary' });
  const leave = hudPress(ui, 'sea:ask-no', `${port ? 'Leave' : 'Cancel'}  ${noKey()}`, () => answer(false));
  const mend =
    repair &&
    port &&
    hudPress(ui, 'sea:ask-repair', withKey('Repair Ship', 'repair'), repair.mend, {
      disabled: repair.offer.why !== null,
    });
  const mendLine =
    repair && mend ? (repair.offer.why ?? `Repairing your ship here costs ${repair.offer.price} Aurem.`) : '';
  return {
    id: 'sea:ask',
    role: 'window',
    direction: 'column',
    width: mend ? 500 : 420,
    padding: 2,
    solid: true,
    label: [words.title, words.line, mendLine].filter(Boolean).join(' '),
    float: { to: 'screen', at: [0.5, 0.42], anchor: [0.5, 0.5] },
    children: [
      {
        width: 'grow',
        padding: [12, 18, 10, 18],
        ...header(),
        children: [said(words.title, { size: 2, colour: '#f3cf86' })],
      },
      {
        width: 'grow',
        direction: 'column',
        gap: 6,
        padding: [12, 18],
        children: [said(words.line, { colour: DIM }), mendLine ? said(mendLine, { colour: DIM }) : null],
      },
      {
        width: 'grow',
        gap: 10,
        alignX: 'end',
        padding: [10, 18, 12, 18],
        ...footer(),
        children: port ? [yes, mend, leave] : [leave, yes],
      },
    ],
  };
}
