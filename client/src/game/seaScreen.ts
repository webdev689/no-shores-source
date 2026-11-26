// The sea's own layer of the interface, over the display and under the game's windows: the ship's console while the
// ship is the player's to sail, the confirmation of a landing asked after, and over an island docked at, the island's
// tiles of what it holds (`islandPanel.ts`).
import { SHIP_SPEED } from '../overworld/voyage.ts';
import { SKY_NOW } from '../sky/skyDriver.ts';
import type { Child } from '../ui/node.ts';
import type { Layer } from '../ui/stack.ts';
import type { Interface } from '../ui/ui.ts';
import { REGION } from './hudLaw.ts';
import type { LandingAim } from './landingAsk.ts';
import type { Sea } from './sea.ts';
import { landingAskNode, type SeaLandings } from './seaLandings.ts';
import type { SeaLevel } from './seaView.ts';
import { type ConsoleActions, type ConsoleState, shipConsoleNode } from './shipConsole.ts';
import type { Kept } from './shipPanel.ts';

/** What the layer reads off the game: the sea in play while the flow is at sea or choosing a landing, the landings
 *  asked after, the ship's name and class, its hurts as the sea keeps them, and what the console's presses do. */
export interface SeaScreenGame {
  readonly sea: () => Sea | null;
  readonly mode: () => string;
  readonly landings: SeaLandings;
  readonly ship: () => { readonly name: string | null; readonly hull: string };
  readonly kept: () => Kept | null;
  readonly act: Omit<ConsoleActions, 'level' | 'sailOn' | 'heaveTo'>;
  /** The panel over an island docked at, while landings are chosen there. */
  readonly island: (ui: Interface) => Child;
}

/** The wind the sails feel where the eye is: the way it blows and its speed; none before the sky is read. */
function windNow(): ConsoleState['wind'] {
  const { sails, reading } = SKY_NOW.current;
  return sails === null || !reading ? null : { toward: sails, speed: Math.hypot(reading.wind[0], reading.wind[1]) };
}

/** Where a landing made for is bound, in words. */
export function boundWords(aim: LandingAim | null): string | null {
  if (!aim) return null;
  if (aim.kind === 'dock') return `${aim.port}'s harbour, to dock`;
  return `${aim.kind === 'isle' ? aim.words : aim.coast}, to go ashore`;
}

/** The console's state for `sea` as it sails now. */
export function consoleOf(
  sea: Sea,
  game: Pick<SeaScreenGame, 'landings' | 'ship' | 'kept'>,
  wind: ConsoleState['wind'] = windNow(),
): ConsoleState {
  const { passage } = sea;
  const kept = game.kept();
  const ship = game.ship();
  // Held near a hostile ship, it sails at the room's pace, not the one the page asked.
  const paceNow = passage.heldTo ?? passage.paceNow;
  return {
    level: sea.level,
    name: ship.name ?? `The ${ship.hull}`,
    hull: ship.hull,
    heading: sea.heading,
    wind,
    sailing: passage.sailing,
    resumable: sea.resumable,
    pace: passage.pace,
    paceNow,
    held: passage.heldTo !== null,
    speed: passage.sailing ? SHIP_SPEED * passage.way * paceNow : 0,
    bound: boundWords(game.landings.making),
    share: passage.share,
    line: sea.voyageNote,
    water: sea.waterWords ?? REGION,
    kept: { hull: kept?.hull ?? 1, sail: kept?.sail ?? 1, crew: kept?.crew ?? 1 },
    canLeave: sea.sighted !== null,
    canManage: true,
  };
}

/** Whether the ship is the player's to sail from the console: at sea, over it, out of a fight, down aboard it neither
 *  at its helm with the map nor sailing away to other waters. */
export function consoleShown(sea: Sea | null, mode: string): sea is Sea {
  if (!sea || mode !== 'sea') return false;
  return !sea.view.helmView && !sea.aboard.active && !sea.boarding.onDeck && !sea.fight && !sea.travelling;
}

/** The sea's layer. */
export function seaLayer(game: SeaScreenGame): Layer {
  return (ui) => {
    const sea = game.sea();
    const mode = game.mode();
    const shown = consoleShown(sea, mode);
    const actions: ConsoleActions = {
      ...game.act,
      level: (level: SeaLevel) => sea?.switchLevel(level),
      sailOn: () => sea?.helm(0, true, false, 0),
      heaveTo: () => sea?.helm(0, false, true, 0),
    };
    const asking = game.landings.asking;
    return {
      width: 'grow',
      height: 'grow',
      children: [
        shown && shipConsoleNode(ui, consoleOf(sea, game), actions, ui.size.width),
        shown && asking && landingAskNode(ui, asking, (yes) => game.landings.answer(yes)),
        mode === 'landing' && game.island(ui),
      ],
    };
  };
}
