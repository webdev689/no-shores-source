// What the heads-up display shows at sea each frame: where the player is, the keys for what they are doing, the marks,
// the sea's bar, Manage's panel, the offer at her wheel, and the voyage's line.
import type { Waterline } from '../ships/shipMesh.ts';
import { seaHints } from './hints.ts';
import type { Hud } from './hud.ts';
import type { Sea, SeaFrame } from './sea.ts';
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
}

/** Shows one frame at sea, `shown`, on the display. */
export function showSeaHud(hud: Hud, here: Sea, shown: SeaFrame, state: SeaHudState): void {
  const { island, region, onSea } = state;
  const atHelm = here.helmView;
  const { aboard } = here;
  if (state.landing) hud.place('Landings', island ? `The side of ${island} in view` : 'The coast in view');
  else if (atHelm) hud.place('At the helm', region);
  else if (aboard.walking) hud.place('Aboard the Sloop', 'Off the helm');
  else if (aboard.managing) hud.place('Managing the Sloop', region);
  else hud.place('At sea', shown.landfall && island ? `Off ${island}` : region);
  const fighting = here.fight?.lines(state.clock) ?? null;
  hud.hints(seaHints({ fighting, landing: state.landing, atHelm, ...aboard.where }));
  hud.marks(shown.marks);
  const ship = { canLeave: here.inRoom && fighting === null, canManage: fighting === null };
  hud.seaBar(onSea && !atHelm && !aboard.active ? { ...shown, ...ship } : null);
  const build = aboard.managing ? state.build() : null;
  hud.shipPanel(onSea && aboard.managing && build ? shipPanelOf(build, state.waterline, here) : null);
  hud.wheelOffer(onSea && aboard.atWheel);
  hud.note(state.charting ? 'Charting the coast ahead…' : shown.note);
}
