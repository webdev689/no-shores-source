// The sea's clicks and the landings they ask after: a click on the sea sails (in the Oversea view), on a hostile
// ship's mark chases it, and on a port's icon, its island, a coast with no port or one of the sea's islands asks the
// player to confirm the landing. Yes lands at once where the ship lies within reach and nothing else holds the player,
// else sets it making for it (a sea island's anchorage always) and lands once it can; a fight, another course or the
// player leaving the sea lets a landing made for go, on the coast and on a sea island alike. And the confirmation's
// card, in the middle of the view.
import type { Point2 } from '../overworld/ground.ts';
import { coastPoint } from '../overworld/islandView.ts';
import type { Pick as Picked } from '../overworld/overworldPick.ts';
import type { Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { withKey } from './controls.ts';
import { DIM } from './hudPieces.ts';
import { footer, header, hudPress, said } from './hudParts.ts';
import { ISLANDS } from './hudLaw.ts';
import { isleWords } from './isleLaw.ts';
import { IsleLanding } from './isleVisit.ts';
import type { IsleHeld, Isles } from './isles.ts';
import { askWords, type ClickContext, clickAtSea, inReach, LandingCourse, type LandingAim } from './landingAsk.ts';
import type { Landmass } from './landmass.ts';
import { portOf } from './nodes.ts';
import type { Sea } from './sea.ts';
import type { Landfall } from './seaLaw.ts';

/** How far past a sea island's coast a click on the water still means the island, metres. */
const ISLE_CLICK_M = 400;

/** The confirmation standing: the landing asked after, and whether the ship lies within reach of it now. */
export interface Asking {
  readonly aim: LandingAim;
  readonly near: boolean;
}

/** What the landings reach: the sea, the open landmass and the sea's islands; whether the player may be taken
 *  elsewhere now; and what lands on the open landmass, asked only while the player is free: the view flown up over
 *  the island the ship lies off, to choose where. */
export interface LandingsGame {
  readonly sea: () => Sea | null;
  readonly landmass: () => Pick<Landmass, 'id' | 'plan' | 'outline'>;
  readonly isles: Isles;
  readonly free: () => boolean;
  readonly land: (aim: LandingAim) => void;
}

/** What a click is judged against: the open landmass's living port, its coast's name, and the sea's islands built. */
export function clickContext(landmass: Pick<Landmass, 'id' | 'plan'>, isles: Pick<Isles, 'all'>): ClickContext {
  const port = portOf(landmass.plan);
  const coast = ISLANDS[landmass.id] ?? landmass.plan?.name ?? 'this coast';
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
  };
}

/** The landing the sea offers where the ship lies, as the key that asks it (L) asks: none out of reach. */
export function aimOf(landfall: Landfall, here: ClickContext, ship: Point2): LandingAim | null {
  if (!landfall) return null;
  if (landfall.kind === 'isle') return { kind: 'isle', id: landfall.id, words: landfall.words };
  if (landfall.kind === 'dock' && here.port) return { kind: 'dock', port: here.port.name, harbour: here.port.harbour };
  return { kind: 'ashore', coast: here.coast, toward: ship };
}

/** The sea's clicks and the landings they ask after, answered and made for: on the open landmass's coast, and on a
 *  sea island, whose ship sails in to its anchorage. */
export class SeaLandings {
  /** The confirmation standing, if any. */
  asking: Asking | null = null;
  private readonly course = new LandingCourse();
  private readonly isle = new IsleLanding();
  private readonly game: LandingsGame;

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

  /** The confirmation answered: yes lands now within reach while nothing else holds the player, else makes for it
   *  (a sea island's anchorage always, the coast nearest a point clicked inland); no lets it go. */
  answer(yes: boolean): void {
    const [asked, sea] = [this.asking, this.game.sea()];
    this.asking = null;
    if (!yes || !asked || !sea) return;
    const { aim } = asked;
    this.letGo();
    if (aim.kind === 'isle') return void this.isle.begin(sea, this.game.isles, aim.id);
    const near = inReach(aim, sea.landfall);
    if (near && this.game.free()) {
      this.game.land(aim);
      return;
    }
    const to = aim.kind === 'dock' ? aim.harbour : coastPoint(aim.toward, this.game.landmass().outline);
    if (!near) sea.sailTo(to);
    this.course.begin(aim, to);
  }

  /** The landing being made for, if any, as the ship's panel names where it is bound. */
  get making(): LandingAim | null {
    const isle = this.isle.making;
    return this.course.making ?? (isle && { kind: 'isle', ...isle });
  }

  /** Lets any landing made for go: another course set, a fight, or the player washed up. */
  letGo(): void {
    this.course.cancel();
    this.isle.cancel();
  }

  /** The sea island the ship has come to anchor off for its landing, taken once; asked only while nothing else holds
   *  the player. */
  anchored(): IsleHeld | null {
    const sea = this.game.sea();
    return sea && this.isle.arrived(sea, this.game.isles);
  }

  /** Each frame: the question put by once the player is not `atSea` or the ship's view is not theirs to answer it
   *  from, a landing made for let go in a fight or once the player has left the ship, and one on the coast made once
   *  the ship lies within reach of it and nothing else holds the player. */
  frame(atSea = true): void {
    const sea = this.game.sea();
    if (!atSea) {
      this.asking = null;
      this.letGo();
    }
    if (!sea || !atSea) return;
    if (sea.fight) this.letGo();
    if (sea.fight || sea.view.kind !== 'sail' || sea.busy) this.asking = null;
    // What the sea offers is asked only while a landing on the coast is made for.
    if (!this.course.making || !this.game.free()) return;
    const due = this.course.due(sea.landfall, sea.bound);
    if (due) this.game.land(due);
  }
}

/** The confirmation a little above the middle of the view, clear of the ship's console under it: its question in brass,
 *  what yes does, and its two presses, yes with Enter and no with Escape. */
export function landingAskNode(ui: Interface, asking: Asking, answer: (yes: boolean) => void): Node {
  const words = askWords(asking.aim, asking.near);
  return {
    id: 'sea:ask',
    role: 'window',
    direction: 'column',
    width: 420,
    padding: 2,
    solid: true,
    label: `${words.title} ${words.line}`,
    float: { to: 'screen', at: [0.5, 0.42], anchor: [0.5, 0.5] },
    children: [
      {
        width: 'grow',
        padding: [12, 18, 10, 18],
        ...header(),
        children: [said(words.title, { size: 2, colour: '#f3cf86' })],
      },
      { width: 'grow', padding: [12, 18], children: [said(words.line, { colour: DIM })] },
      {
        width: 'grow',
        gap: 10,
        alignX: 'end',
        padding: [10, 18, 12, 18],
        ...footer(),
        children: [
          hudPress(ui, 'sea:ask-no', 'Cancel  Esc', () => answer(false)),
          hudPress(ui, 'sea:ask-yes', withKey(words.yes, 'confirm'), () => answer(true), { role: 'primary' }),
        ],
      },
    ],
  };
}
