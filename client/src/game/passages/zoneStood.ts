// The passage zone the player stands in, and what the page shows of it each frame: the deal in the tracker, its
// pieces as the deal stands for the player, the hollow above ground, the web on the held map, the haul, the cold
// lantern found, and a respawn's loss said plainly.
import type { Alone } from '../scene.ts';
import type { Foot } from '../foot.ts';
import type { Quest } from '../tasks.ts';
import type { NodeInfo } from '../worldData.ts';
import type { PassageSeenState } from '../../network/passageMessages.ts';
import type { IsleShown } from '../../islands/islePlan.ts';
import type { LandSheet } from '../../heldmap/landSheet.ts';
import type { PassagePiece, PassagePlan, PassageWeb } from '../../rules/passageRules.ts';
import type { Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { lampCold as coldFor } from './athericBounty.ts';
import { gearOf } from './passageAsks.ts';
import type { ZoneEntry } from './passageEnter.ts';
import { haulOf, passageWordOf } from './passageHeard.ts';
import { passageSheet } from './passageMap.ts';
import { haulNode, lanternNode, NARROW, signNode } from './passagePanels.ts';
import { boxedPieces, type PieceState } from './passagePieces.ts';
import { dealTracker, haulView, leaveWarning, type OnwardSign } from './passageWords.ts';
import { withPieces } from './passageZone.ts';
import { passageWaypoint, type ZoneFoe } from './passageWaypoint.ts';

/** How long the cold lantern found stands in the view, seconds. */
const LANTERN_S = 6;

/** The zone the player stands in: its web, its entry, the island shown for it above ground, and the zones passed this
 *  dive before it, by number, the first behind the patrol zone's mouth. */
export interface InZone {
  readonly web: PassageWeb;
  readonly entry: ZoneEntry;
  readonly isle: IsleShown | null;
  readonly passed: readonly number[];
}

/** The pieces as the deal stands for the player in a zone, those of them that stand as plain boxes (each whose
 *  module its pack, the islands' kit above ground or the dungeons' under, does not hold yet), and the key they are
 *  laid again by when that changes. */
export interface Pieces {
  readonly plan: PassagePlan;
  readonly state: PieceState;
  readonly boxes: readonly PassagePiece[];
  readonly done: boolean;
  readonly key: string;
}

/** What the zone stood in asks of the game. */
export interface StoodHost {
  readonly foot: () => Foot | null;
  readonly now: () => number;
  readonly tell: (words: string) => void;
  readonly body: () => { readonly x: number; readonly y: number };
  /** Whether a piece's module has come in its pack: above ground (`hollow`) the islands' kit's, else the dungeons'. */
  readonly modelled: (hollow: boolean, module: string) => boolean;
}

/** The lamps the player lit this week on `island`, by number, as their gear says it. */
export function lampsLit(foot: Foot | null, island: string): readonly number[] {
  return gearOf(foot)?.islandLamps?.find((each) => each.island === island)?.lamps ?? [];
}

export class ZoneStood {
  /** The zone stood in, kept until another place is stood in. */
  zone: InZone | null = null;
  private readonly host: StoodHost;
  /** When the cold lantern was found, by the rooms' clock, seconds; and whether the haul held it last frame. */
  private lanternFound = Number.NEGATIVE_INFINITY;
  private lanternHeld = false;
  /** What the haul held while the player stood, to say plainly what a respawn lost. */
  private carried = 0;
  private wasDown = false;
  /** The pieces as last read, and the zone and word of the room they were read from. */
  private laid: { readonly zone: InZone; readonly seen: PassageSeenState | null; readonly pieces: Pieces } | null =
    null;
  /** The hollow shown, and the pieces it stands. */
  private shownIsle: { readonly pieces: Pieces; readonly isle: IsleShown } | null = null;

  constructor(host: StoodHost) {
    this.host = host;
  }

  /** The zone stood in from now; what a respawn lost is judged afresh in it. */
  set(zone: InZone | null): void {
    this.zone = zone;
    [this.carried, this.wasDown] = [0, false];
    // A lantern carried in already (a rejoin, a reload) was found before: its moment is not played again.
    this.lanternHeld = haulOf(gearOf(this.host.foot())?.dive?.haul).lantern;
  }

  /** The zone, while the player's foot stands in its room. */
  inZone(): InZone | null {
    return this.zone && this.host.foot()?.node.id === this.zone.entry.room ? this.zone : null;
  }

  private seen(): PassageSeenState | null {
    return this.host.foot()?.held.passage ?? null;
  }

  /** Each frame on foot in a zone: the cold lantern found, and a respawn's loss said plainly; a zone left by
   *  another way (the ship, a join) is no longer the one a way starts from. */
  frame(foot: Foot | null, onFoot: boolean): void {
    if (this.zone && foot && onFoot && foot.node.id !== this.zone.entry.room) this.set(null);
    if (!this.zone || foot?.node.id !== this.zone.entry.room) return;
    const down = foot.fallen;
    const haul = haulOf(gearOf(foot)?.dive?.haul);
    if (haul.lantern && !this.lanternHeld) this.lanternFound = this.host.now() / 1000;
    this.lanternHeld = haul.lantern;
    const carried = haulView(haul).lines.length;
    if (this.wasDown && !down && this.carried > 0 && carried === 0) this.host.tell('What you carried is lost.');
    if (!down) this.carried = carried;
    this.wasDown = down;
  }

  /** The zone's deal in the tracker, where it stands; null out of a zone. */
  tracker(): Quest | null {
    const zone = this.inZone();
    const gear = gearOf(this.host.foot());
    const word = zone && passageWordOf(zone.entry.plan.zone, gear?.dive, this.seen(), gear?.spent.length);
    if (!zone || !word) return null;
    const nodes = zone.entry.plan.pieces.filter((piece) => piece.kind === 'node').length;
    const lamp = zone.entry.plan.zone.lamp;
    const lampCold = lamp !== null && coldFor(gear?.athericBounties, zone.web.island, lamp);
    const round = { nodes, public: gear?.dive?.route === 0, lampCold };
    return dealTracker(zone.entry.plan.zone, { ...word, ...round }, this.host.now());
  }

  /** Where the compass points in a zone, `foes` those the player sees (`passageWaypoint`); null out of one. */
  waypoint(foes: readonly ZoneFoe[]): readonly [number, number] | null {
    const zone = this.inZone();
    if (!zone) return null;
    const body = this.host.body();
    const spent = gearOf(this.host.foot())?.spent ?? [];
    return passageWaypoint(zone.entry.plan, this.seen(), [body.x, body.y], foes, spent);
  }

  /** What the leave held warns of in a zone while anything is carried. */
  leaveWarning(): string | null {
    return this.inZone() ? leaveWarning(haulOf(gearOf(this.host.foot())?.dive?.haul)) : null;
  }

  /** The pieces' state as the deal stands for the player, and the zone's plan; null out of a zone. Each piece stands
   *  as its pack's module, as plain boxes only while that pack does not hold it. */
  pieces(): Pieces | null {
    const zone = this.inZone();
    if (!zone) return null;
    const seen = this.seen();
    const bits = (set: number) => [0, 1, 2, 3, 4, 5, 6, 7].filter((bit) => (set >> bit) & 1);
    const open = seen?.open ? zone.entry.plan.zone.onward.map((unused, place) => place) : [];
    const state = {
      lampLit: seen?.lampLit ?? false,
      openMouths: open,
      kindled: bits(seen?.lit ?? 0),
      broken: bits(seen?.broken ?? 0),
    };
    const done = seen?.done ?? false;
    const hollow = zone.isle !== null;
    const boxes = boxedPieces(zone.entry.plan.pieces, state, done, (module) => this.host.modelled(hollow, module));
    const key = JSON.stringify([zone.entry.room, state, boxes.map((piece) => [piece.kind, piece.number]), done]);
    // Kept as it was while the zone, the room's word and the packs say the same.
    if (this.laid?.zone === zone && this.laid.pieces.key === key) return this.laid.pieces;
    const pieces = { plan: zone.entry.plan, state, boxes, done, key };
    this.laid = { zone, seen, pieces };
    return pieces;
  }

  /** The hollow the player stands in, drawn alone under its climate's sky where its zone lies on the island; null
   *  out of one. */
  hollowAir(): Alone | null {
    const zone = this.inZone();
    return zone?.isle ? { climate: zone.isle.climate, at: zone.entry.plan.zone.at } : null;
  }

  /** The hollow above ground the islands' layer draws while the player stands in it. */
  isles(): readonly IsleShown[] {
    const [zone, pieces] = [this.inZone(), this.pieces()];
    if (!zone?.isle || !pieces) return [];
    if (this.shownIsle?.pieces !== pieces)
      this.shownIsle = { pieces, isle: withPieces(zone.isle, pieces.plan, pieces.state, pieces.done) };
    return [this.shownIsle.isle];
  }

  /** The web as the held map shows it in a zone (`passageSheet`), its sheet laid so "You" stands at the zone the
   *  player stands in, wherever in it they are; null out of a zone. */
  map(): LandSheet | null {
    const zone = this.inZone();
    if (!zone) return null;
    const { patrol } = zone.entry;
    const level = gearOf(this.host.foot())?.level;
    const lit = lampsLit(this.host.foot(), zone.web.island);
    const where = {
      here: zone.entry.plan.zone.number,
      come: zone.passed,
      lit,
      ...(level === undefined ? {} : { level }),
    };
    const home = { name: patrol.name, at: patrol.centre };
    const { sheet, you } = passageSheet(zone.web, where, 'The passages', home);
    const body = this.host.body();
    return { ...sheet, origin: [body.x - you[0], body.y - you[1]] };
  }

  /** The way come this dive, on the island: the patrol zone's place, each zone passed, and the zone stood in. */
  comeOf(patrol: NodeInfo): (readonly [number, number])[] {
    const zone = this.zone;
    if (!zone) return [patrol.centre];
    return [
      patrol.centre,
      ...[...zone.passed, zone.entry.plan.zone.number].flatMap((number) => {
        const passed = zone.web.zones.find((each) => each.number === number);
        return passed ? [passed.at] : [];
      }),
    ];
  }

  /** An onward mouth's sign, the cold lantern found and the haul; null out of a zone. */
  layer(ui: Interface, sign: OnwardSign | null): Node | null {
    if (!this.inZone()) return null;
    const found = this.host.now() / 1000 - this.lanternFound < LANTERN_S;
    const children = [
      sign && signNode(sign, ui.size),
      found ? lanternNode(ui.size) : null,
      // On a narrow view the lantern found stands a moment where the haul does, in its place.
      found && ui.size.width <= NARROW
        ? null
        : haulNode(haulView(haulOf(gearOf(this.host.foot())?.dive?.haul)), ui.size),
    ];
    return { width: 'grow', height: 'grow', children: children.filter((child) => child !== null) };
  }
}
