// What the heads-up display shows at sea each frame: where the player is, the keys for what they are doing, the marks,
// the compass and the ships on it, a captain's bar and the fight's notices in a fight, the sea's bar, Manage's panel,
// the offer at the ship's wheel, and the voyage's line.
import { forwardOf, poseOf } from '../overworld/overworldCamera.ts';
import { headingOf, type ShipMark } from '../plus/compass.ts';
import type { FightCaptain } from '../rules/fightRules.ts';
import type { Waterline } from '../ships/shipMesh.ts';
import { seaHints } from './hints.ts';
import { sightOf } from './seaHostiles.ts';
import type { Hud } from './hud.ts';
import type { Sea } from './sea.ts';
import type { SeaFrame } from './seaFrame.ts';
import type { SeaRoom } from './seaRoom.ts';
import { aimLineOf, SeaSight } from './seaSight.ts';
import { shipPanelOf, type SloopBuild } from './shipPanel.ts';

/** What the display reads off the game besides the sea: whether a landing is being chosen or the sea's controls are
 *  the player's, the island the ship lies off and the sea's own name, the clock, its build once Manage asks for it, its
 *  waterline, and whether a coast ahead is being charted. */
export interface SeaHudState {
  readonly landing: boolean;
  readonly onSea: boolean;
  readonly island: string | undefined;
  readonly region: string;
  readonly clock: number;
  readonly build: () => SloopBuild | null;
  readonly waterline: Waterline;
  readonly charting: boolean;
  /** The friendly ships round the ship, for the compass. */
  readonly friendly: readonly ShipMark[];
  /** What the sea's word says now, DFO's toasts: a ship sighted, who joins, colours struck, what floats gathered. */
  readonly notices: readonly string[];
}

/** The ships the compass marks at sea, as DFO's helm marks them: in a fight its captains, grey once its colours are
 *  down and red while it would take the player, none going down; out of one, every other player's ship in bone and
 *  every hostile one in red, marked as far off as it is sighted. */
export function seaShipMarks(
  captains: readonly FightCaptain[] | null,
  sighted: Pick<SeaRoom, 'others' | 'pirates'> | null,
): ShipMark[] {
  if (captains)
    return captains.flatMap((captain): ShipMark[] => {
      if (captain.state === 'sinking' || captain.state === 'sunk') return [];
      const kind = captain.state !== 'afloat' ? 'struck' : captain.hostile ? 'hostile' : 'ship';
      return [{ x: captain.ship[0] ?? 0, y: captain.ship[1] ?? 0, kind }];
    });
  return [
    ...(sighted?.others ?? []).map((ship): ShipMark => ({ x: ship.x, y: ship.y, kind: 'ship' })),
    ...(sighted?.pirates ?? []).map((pirate): ShipMark => ({
      x: pirate.x,
      y: pirate.y,
      kind: 'hostile',
      rangeM: sightOf(pirate),
    })),
  ];
}

/** The sight over the display, made the first time the guns are laid. */
let sight: SeaSight | null = null;

/** The sight while the player lays their guns in a fight: the crosshair and the aim line. */
function showSight(here: Sea, onDeck: boolean): void {
  const fight = here.fight;
  const aiming = fight !== null && fight.aimingNow && !onDeck;
  if (!aiming && !sight) return;
  const parent = document.querySelector<HTMLElement>('.hud');
  if (!sight && parent) sight = new SeaSight(parent);
  sight?.show(aiming, fight ? aimLineOf(fight.view.lay, fight.view.player) : null);
}

/** The place line at sea: the deck's fight's words on a struck ship's deck, the coast while landings are chosen, else
 *  what the ship is doing over the water it is in (its name and holder, as the helm says it; the region where it has
 *  none), or the island it lies off. */
export function seaPlace(
  here: Pick<Sea, 'boarding' | 'aboard' | 'waterWords'> & { readonly view: Pick<Sea['view'], 'helmView'> },
  shown: Pick<SeaFrame, 'landfall'>,
  state: Pick<SeaHudState, 'landing' | 'island' | 'region'>,
): [string, string] {
  const { island, region } = state;
  const deck = here.boarding.words;
  const water = here.waterWords ?? region;
  if (deck) return [deck.place, deck.line];
  if (state.landing) return ['Landings', island ? `The side of ${island} in view` : 'The coast in view'];
  if (here.view.helmView) return ['At the helm', water];
  if (here.aboard.walking) return ['Aboard the Sloop', 'Off the helm'];
  if (here.aboard.managing) return ['Managing the Sloop', water];
  return ['At sea', shown.landfall && island ? `Off ${island}` : water];
}

/** Shows one frame at sea, `shown`, on the display. */
export function showSeaHud(hud: Hud, here: Sea, shown: SeaFrame, state: SeaHudState): void {
  const { onSea } = state;
  const atHelm = here.view.helmView;
  const { aboard } = here;
  // On a struck ship's deck, the display says where its fight stands and lists the keys on foot.
  const deck = here.boarding.words;
  hud.place(...seaPlace(here, shown, state));
  const { fight } = here;
  // In a fight the hints are its keys alone, as on foot; the sea's word and the fight's messages stand as DFO's
  // notices, and what the card, the plates, the sight and its warning show is not said again.
  const fighting = fight ? [] : null;
  hud.hints(deck ? deck.hints : seaHints({ fighting, landing: state.landing, atHelm, ...aboard.where }));
  hud.notices([...state.notices, ...(fight && !deck ? fight.messages(state.clock) : [])]);
  hud.marks(shown.marks);
  // The player's plate, the battery rose, the card and the tally in a fight (on a struck ship's deck, the fight on foot's own),
  // before the ships' plates, which keep under its card.
  hud.seaFight(deck ? null : (here.fight?.display(state.clock) ?? null));
  const { eye, yaw, pitch, fov } = shown.shot;
  // Aboard it the ships' plates and the sea's bar give the view to the fight on foot's display, as on land.
  hud.shipBars(deck ? [] : shown.bars, poseOf({ eye: [...eye], forward: forwardOf(yaw, -pitch) }, fov));
  // The held map raised at the helm covers the view, the compass with it.
  const ships = seaShipMarks(here.fight?.captains ?? null, here.sighted);
  hud.compass(
    atHelm ? null : { heading: headingOf(forwardOf(yaw, 0)), from: shown.focus, ships: [...ships, ...state.friendly] },
  );
  // In a fight the sea bar goes: its map, pace, Manage and Leave wait for the fight's end, as its keys do.
  const ship = { canLeave: here.inRoom, canManage: true };
  hud.seaBar(onSea && !atHelm && !aboard.active && !deck && !here.fight ? { ...shown, ...ship } : null);
  showSight(here, deck !== null);
  const build = aboard.managing ? state.build() : null;
  hud.shipPanel(onSea && aboard.managing && build ? shipPanelOf(build, state.waterline, here) : null);
  hud.wheelOffer(onSea && aboard.atWheel);
  hud.note(state.charting ? 'Charting the coast ahead…' : shown.note);
}

/** Takes down what the sea alone shows, once the player is on land: the ships' plates and the sight, the fight's
 *  readout, the sea bar, Manage's panel and the wheel's offer. */
export function hideSeaHud(hud: Hud): void {
  // With no plate to place, the pose is never read.
  hud.shipBars([], poseOf({ eye: [0, 0, 0], forward: forwardOf(0, 0) }, 1));
  hud.seaFight(null);
  hud.seaBar(null);
  hud.shipPanel(null);
  hud.wheelOffer(false);
  sight?.show(false, null);
}
