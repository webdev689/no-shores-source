// What the heads-up display shows at sea each frame: where the player is, the keys for what they are doing, the marks,
// the compass and the ships on it; in a fight each captain's bar, the fight's readout, its task and DFO's notices;
// Manage's panel, the offer at the ship's wheel, and the voyage's line. The ship's console is `seaScreen.ts`.
import { forwardOf, poseOf } from '../overworld/overworldCamera.ts';
import { headingOf, type ShipMark } from '../plus/compass.ts';
import type { FightCaptain } from '../rules/fightRules.ts';
import { runOutAt } from '../ships/fightDisplay.ts';
import type { Waterline } from '../ships/shipMesh.ts';
import { seaStrip } from './hints.ts';
import { sightOf, sightedHostiles } from './seaHostiles.ts';
import type { Quests } from './quests/quests.ts';
import type { Chart } from './quests/waypoint.ts';
import type { Hud } from './hud.ts';
import type { Sea } from './sea.ts';
import type { SeaFrame } from './seaFrame.ts';
import type { SeaRoom } from './seaRoom.ts';
import { aimLineOf } from './seaSight.ts';
import { seaFightQuest } from './seaPanel.ts';
import { type HullBuild, shipPanelOf } from './shipPanel.ts';

/** What the display reads off the game besides the sea: whether a landing is being chosen or the sea's controls are
 *  the player's, the island the ship lies off and the sea's own name, the clock, its build once Manage asks for it, its
 *  waterline, and whether a coast ahead is being charted. */
export interface SeaHudState {
  readonly landing: boolean;
  readonly onSea: boolean;
  readonly island: string | undefined;
  readonly region: string;
  readonly clock: number;
  readonly build: () => HullBuild | null;
  readonly waterline: Waterline;
  readonly charting: boolean;
  /** The friendly ships round the ship, for the compass. */
  readonly friendly: readonly ShipMark[];
  /** What the sea's word says now, DFO's toasts: a ship sighted, who joins, colours struck, what floats gathered. */
  readonly notices: readonly string[];
  /** Whether the mouse is free, for a click on the deck to take it. */
  readonly free: boolean;
  /** The roads, the world their waypoint is found over, and whether the story and the welcome are past. */
  readonly quests: Quests;
  readonly chart: Chart;
  readonly past: boolean;
}

/** The ships the compass marks at sea, as DFO's helm marks them: in a fight its captains, grey once its colours are
 *  down, red while it would take the player and lit while a battery of its stands run out at the player's ship
 *  (`own`), none going down; out of one, every other player's ship in bone, every hostile one in red, marked as far
 *  off as it is sighted, and every friendly ship the room keeps as the traffic's are. */
export function seaShipMarks(
  captains: readonly FightCaptain[] | null,
  sighted: (Pick<SeaRoom, 'others' | 'hostiles'> & Partial<Pick<SeaRoom, 'friendlies'>>) | null,
  own: readonly number[] | null = null,
): ShipMark[] {
  if (captains)
    return captains.flatMap((captain): ShipMark[] => {
      if (captain.state === 'sinking' || captain.state === 'sunk') return [];
      const firing = own !== null && runOutAt(captain, own).length > 0;
      const kind = captain.state !== 'afloat' ? 'struck' : firing ? 'firing' : captain.hostile ? 'hostile' : 'ship';
      return [{ x: captain.ship[0] ?? 0, y: captain.ship[1] ?? 0, kind }];
    });
  return [
    ...(sighted?.others ?? []).map((ship): ShipMark => ({ x: ship.x, y: ship.y, kind: 'ship' })),
    ...(sighted?.hostiles ?? []).map((hostile): ShipMark => ({
      x: hostile.x,
      y: hostile.y,
      kind: 'hostile',
      rangeM: sightOf(hostile),
    })),
    ...(sighted?.friendlies ?? []).map((friend): ShipMark => ({ x: friend.x, y: friend.y, kind: 'friendly' })),
  ];
}

/** The sight while the player lays their guns in a fight: the crosshair and the aim line. */
function showSight(hud: Hud, here: Sea, onDeck: boolean): void {
  const fight = here.fight;
  const aiming = fight !== null && fight.aimingNow && !onDeck;
  hud.sight(aiming, fight ? aimLineOf(fight.view.lay, fight.view.player) : null);
}

/** The place line at sea: the deck's fight's words on a struck ship's deck, the coast while landings are chosen, else
 *  what the ship is doing over the water it is in (its name and holder, as the helm says it; the region where it has
 *  none), or the island it lies off. */
export function seaPlace(
  here: Pick<Sea, 'boarding' | 'aboard' | 'waterWords'> & { readonly view: Pick<Sea['view'], 'helmView'> },
  shown: Pick<SeaFrame, 'landfall'>,
  state: Pick<SeaHudState, 'landing' | 'island' | 'region'> & Partial<Pick<SeaHudState, 'build'>>,
): [string, string] {
  const { island, region } = state;
  const hull = state.build?.()?.name ?? 'Sloop';
  const deck = here.boarding.words;
  const water = here.waterWords ?? region;
  if (deck) return [deck.place, deck.line];
  if (state.landing) return ['Landings', island ? `The side of ${island} in view` : 'The coast in view'];
  if (here.view.helmView) return ['At the helm', water];
  if (here.aboard.walking) return [`Aboard the ${hull}`, 'Off the helm'];
  if (here.aboard.managing) return [`Managing the ${hull}`, water];
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
  // Sailing away to other waters, the veil says where to while the picture is black.
  if (here.travelling) hud.veil(here.travelling.away.veil);
  const { fight } = here;
  // In a fight the hints are its keys alone, as on foot; the sea's word and the fight's messages stand as DFO's
  // notices, and what the card, the plates, the sight and its warning show is not said again.
  hud.strip(
    deck
      ? deck.hints
      : seaStrip({
          level: here.level,
          fighting: fight !== null,
          aiming: fight?.aimingNow ?? false,
          landing: state.landing,
          atHelm,
          ...aboard.where,
          free: state.free,
        }),
  );
  hud.notices([...state.notices, ...(fight && !deck ? fight.messages(state.clock) : [])]);
  // The roads at sea: their waypoint on the compass, from the ship, at the isles and hostile ships in sight or the
  // landing of the zone a goal is in; in the tracker, a fight's task while one runs, else the quest walked.
  const isles = (here.isles?.all() ?? []).map(({ seen }) => ({ kind: seen.kind, at: seen.at }));
  const hostiles = sightedHostiles(here.sighted?.hostiles ?? [], shown.focus).map((ship) => ({
    faction: ship.faction,
    at: [ship.x, ship.y] as const,
  }));
  const guided = state.quests.guide({ on: 'sea', at: shown.focus, isles, hostiles }, state.chart, state.past);
  const task = fight && !deck ? fight.readout(state.clock) : null;
  hud.tasks.show(task ? seaFightQuest('Sea fight', task.left, task.men) : state.quests.tracked);
  hud.marks(shown.marks);
  // The player's plate, its abilities' bar, the card and the tally in a fight (on a struck ship's deck, the fight on foot's own),
  // before the ships' plates, which keep under its card.
  hud.seaFight(deck ? null : (here.fight?.display(state.clock) ?? null));
  const { eye, yaw, pitch, fov } = shown.shot;
  // Aboard it the ships' plates give the view to the fight on foot's display, as on land.
  hud.shipBars(deck ? [] : shown.bars, poseOf({ eye: [...eye], forward: forwardOf(yaw, -pitch) }, fov));
  // Over other players' ships, the marks they wear on land, gone with the ships' plates aboard a struck ship, and at
  // the helm, where the held map covers the view.
  hud.seaPlayers(deck || atHelm ? [] : shown.players);
  // The held map raised at the helm covers the view, the compass with it.
  const ships = seaShipMarks(here.fight?.captains ?? null, here.sighted, here.fight?.vessel.ship ?? null);
  hud.compass(
    atHelm
      ? null
      : {
          heading: headingOf(forwardOf(yaw, 0)),
          from: shown.focus,
          ships: [...ships, ...state.friendly],
          quest: guided.at,
        },
  );
  showSight(hud, here, deck !== null);
  const build = aboard.managing ? state.build() : null;
  hud.shipPanel(onSea && aboard.managing && build ? shipPanelOf(build, state.waterline, here) : null);
  hud.wheelOffer(onSea && aboard.atWheel);
  hud.note(state.charting ? 'Charting the coast ahead…' : shown.note);
}

/** Takes down what the sea alone shows, once the player is on land: the ships' plates, the marks over other players'
 *  ships and the sight, the fight's readout, Manage's panel and the wheel's offer. The ship's console is the sea's own
 *  layer (`seaScreen.ts`). The tracker is the land's own to show. */
export function hideSeaHud(hud: Hud): void {
  // With no plate to place, the pose is never read.
  hud.shipBars([], poseOf({ eye: [0, 0, 0], forward: forwardOf(0, 0) }, 1));
  hud.seaPlayers([]);
  hud.seaFight(null);
  hud.shipPanel(null);
  hud.wheelOffer(false);
  hud.sight(false, null);
}
