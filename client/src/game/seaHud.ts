// What the heads-up display shows at sea each frame: where the player is, the keys for what they are doing, the marks,
// the compass and the ships on it, a captain's bar in a fight, the sea's bar, Manage's panel, the offer at her wheel,
// and the voyage's line.
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
import { shipPanelOf, type SloopBuild } from './shipPanel.ts';

/** What the display reads off the game besides the sea: whether a landing is being chosen or the sea's controls are
 *  the player's, the island she lies off and the sea's own name, the clock, her build once Manage asks for it, her
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
  /** The friendly ships round her, for the compass. */
  readonly friendly: readonly ShipMark[];
}

/** The ships the compass marks at sea, as DFO's helm marks them: in a fight its captains, grey once her colours are
 *  down and red while she would take the player, none going down; out of one, every other player's ship in bone and
 *  every hostile one in red, marked as far off as she is sighted. */
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

/** Shows one frame at sea, `shown`, on the display. */
export function showSeaHud(hud: Hud, here: Sea, shown: SeaFrame, state: SeaHudState): void {
  const { island, region, onSea } = state;
  const atHelm = here.helmView;
  const { aboard } = here;
  if (state.landing) hud.place('Landings', island ? `The side of ${island} in view` : 'The coast in view');
  else if (atHelm) hud.place('At the helm', here.waterWords ?? region);
  else if (aboard.walking) hud.place('Aboard the Sloop', 'Off the helm');
  else if (aboard.managing) hud.place('Managing the Sloop', region);
  else hud.place('At sea', shown.landfall && island ? `Off ${island}` : (here.waterWords ?? region));
  const fighting = here.fight?.lines(state.clock) ?? null;
  hud.hints(seaHints({ fighting, landing: state.landing, atHelm, ...aboard.where }));
  hud.marks(shown.marks);
  const { eye, yaw, pitch, fov } = shown.shot;
  hud.shipBars(shown.bars, poseOf({ eye: [...eye], forward: forwardOf(yaw, -pitch) }, fov));
  // The held map raised at the helm covers the view, the compass with it.
  const ships = seaShipMarks(here.fight?.captains ?? null, here.sighted);
  hud.compass(
    atHelm ? null : { heading: headingOf(forwardOf(yaw, 0)), from: shown.focus, ships: [...ships, ...state.friendly] },
  );
  const ship = { canLeave: here.inRoom && fighting === null, canManage: fighting === null };
  hud.seaBar(onSea && !atHelm && !aboard.active ? { ...shown, ...ship } : null);
  const build = aboard.managing ? state.build() : null;
  hud.shipPanel(onSea && aboard.managing && build ? shipPanelOf(build, state.waterline, here) : null);
  hud.wheelOffer(onSea && aboard.atWheel);
  hud.note(state.charting ? 'Charting the coast ahead…' : shown.note);
}
