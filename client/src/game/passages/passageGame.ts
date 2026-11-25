// The passages as the game plays them: E at a run's sealed door in the patrol zone opens the mouths' card, and its
// choice asks to begin; in a zone, E at an open mouth asks to go on, E held at the lamp lights it (then Home), E held
// at a dead lamp kindles it. The room judges every ask; its yes plays the way between zones while the next room is
// joined. Each frame the zone's deal stands in the tracker, its pieces as the deal stands, the haul on the right and
// an onward mouth's sign on approach.
import { arriving, type Flow } from '../flow.ts';
import type { Alone } from '../scene.ts';
import { Foot } from '../foot.ts';
import { weekOf } from '../guild/guildLaw.ts';
import type { FootContext, Uses } from '../footPlace.ts';
import { ASKS, type GearAsk, type GearState } from '../../network/gearMessages.ts';
import { HOLDING_LAMP, type DiveState, type PassageSeenState } from '../../network/passageMessages.ts';
import type { GearItem } from '../../network/gearMessages.ts';
import { type NodeLayout, placesOf } from '../../layout/layouts.ts';
import { TIERS } from '../activityWords.ts';
import { answerText } from '../../player/gear.ts';
import type { Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import type { DungeonLayout } from '../dungeonLayout.ts';
import type { Quest } from '../tasks.ts';
import type { NodeInfo } from '../worldData.ts';
import { passageRoom, passageRoomName, runInstance, sharedRun } from '../rooms.ts';
import type { IsleShown } from '../../islands/islePlan.ts';
import type { Difficulty } from '../../heldmap/heldMap.ts';
import type { LandSheet } from '../../heldmap/landSheet.ts';
import { type PassageDoor, type PassagePlan, type PassageWeb, startPassageDoor } from '../../rules/passageRules.ts';
import { enterZone, onwardOrBack, type ZoneEntry } from './passageEnter.ts';
import { answerHeard, haulOf, passageWordOf } from './passageHeard.ts';
import { passageSheet } from './passageMap.ts';
import { haulNode, lanternNode, MouthsCardView, NARROW, signNode } from './passagePanels.ts';
import type { PieceState } from './passagePieces.ts';
import { holdAt, homeSpot, MOUTH_REACH_M, mouthAt, onwardAt } from './passageReach.ts';
import { WayBetween, type WayHost, type WayPlayed } from './wayBetween.ts';
import {
  dealTracker,
  haulView,
  inSentence,
  lampPrompt,
  leaveWarning,
  mouthsChoice,
  onwardSign,
  type OnwardSign,
  type Route,
} from './passageWords.ts';
import { withPieces, zoneIsle, zoneLayout } from './passageZone.ts';

/** How long the page waits on the room's answer to an ask of the passages before saying it did not come. */
const ANSWER_WAIT_S = 10;
const UNANSWERED = 'Your room did not answer. Try again.';
const NOT_LAID = 'The zone beyond could not be laid, so the way on stays shut.';
/** The room's refusal of an ask that needs a lamp (crates/gear `Refusal::NoLamp`, plus one), and what it means for a
 *  begin at a lamp: the player has not lit it this week. */
const NO_LAMP = 174;
const LAMP_NOT_LIT = 'You have not lit that lamp this week.';
/** How far past a mouth's reach the mouths' card stays open, metres: walked further, it closes. */
const CARD_REACH_M = 6;
/** How long the cold lantern found stands in the view, seconds. */
const LANTERN_S = 6;

/** What the passages ask of the game. */
export interface PassageHost {
  readonly module: Promise<WebAssembly.Module>;
  readonly context: FootContext;
  readonly foot: () => Foot | null;
  readonly flow: () => Flow;
  setFlow(flow: Flow): void;
  /** Whether the place gone to has come: set false as the way begins and true once its room is joined. */
  setReady(ready: boolean): void;
  readonly land: () => { readonly layouts: readonly NodeLayout[]; readonly nodes: readonly NodeInfo[] };
  readonly goInto: (entering: () => Promise<Foot>) => Promise<void>;
  readonly showDungeon: (layout: DungeonLayout, node: NodeInfo) => Promise<void>;
  /** The islands' layer: it asks for a hollow's kits before it is shown, as `showDungeon` awaits a dungeon's packs
   *  (never failing), and says whether a kit's pack has come. */
  readonly isles: { readonly warm: (isle: IsleShown) => Promise<void>; readonly hasKit: (kit: string) => boolean };
  /** Where the player's company's members play: none alone. */
  readonly companyPlaces: () => Promise<readonly string[]>;
  readonly tell: (words: string) => void;
  /** What a way that fails does, asked as it sets out (`WayHost`). */
  readonly fallback: WayHost['fallback'];
  /** The moment now, milliseconds since 1970, by the rooms' clock (`roomNow`), so the week turns with theirs. */
  readonly now: () => number;
}

/** An ask of the passages awaiting the room's answer: the foot it was asked on (a room left drops it), how many asks
 *  the room had answered as it went, the dive as it stood, when it went, and what its yes does. */
interface Asked {
  readonly foot: Foot;
  readonly kind: number;
  readonly answered: number;
  readonly dive: DiveState<GearItem> | null;
  readonly since: number;
  readonly yes: (dive: DiveState<GearItem> | null) => void;
}

/** The zone the player stands in: its web, its entry, the island shown for it above ground, and the zones passed this
 *  dive before it, by number, the first behind the patrol zone's mouth. */
interface InZone {
  readonly web: PassageWeb;
  readonly entry: ZoneEntry;
  readonly isle: IsleShown | null;
  readonly passed: readonly number[];
}

/** The pieces as the deal stands for the player in a zone, whether they stand as plain boxes (under ground, or above
 *  while the islands' passage pack has not come), and the key they are laid again by when that changes. */
interface Pieces {
  readonly plan: PassagePlan;
  readonly state: PieceState;
  readonly boxed: boolean;
  readonly done: boolean;
  readonly key: string;
}

export class PassageGame {
  private readonly host: PassageHost;
  private door: PassageDoor | null = null;
  private readonly webs = new Map<string, PassageWeb | null>();
  private zone: InZone | null = null;
  private asked: Asked | null = null;
  private sign: OnwardSign | null = null;
  /** The way between places, shared with the crossings between patrol zones. */
  readonly ways: WayBetween;
  /** The patrol zone's mouth whose card stands open, the foot it was opened on and where its door stands. */
  private mouth: number | null = null;
  private cardAt: { readonly foot: Foot; readonly door: readonly [number, number] } | null = null;
  /** When the cold lantern was found, by the rooms' clock, seconds; and whether the haul held it last frame. */
  private lanternFound = Number.NEGATIVE_INFINITY;
  private lanternHeld = false;
  /** What the haul held while the player stood, to say plainly what a respawn lost. */
  private carried = 0;
  private wasDown = false;
  private useHeld = false;
  /** Whether E let go of was told the room once already, so it is not told again each frame until it is heard. */
  private letGo = false;
  /** The pieces as last read, and the zone and word of the room they were read from. */
  private laid: { readonly zone: InZone; readonly seen: PassageSeenState | null; readonly pieces: Pieces } | null =
    null;
  /** The hollow shown, and the pieces it stands. */
  private shownIsle: { readonly pieces: Pieces; readonly isle: IsleShown } | null = null;
  readonly card: MouthsCardView;

  constructor(host: PassageHost) {
    this.host = host;
    const { walker } = host.context;
    const face = (facing: number) => void (walker.player = { ...walker.player, yaw: facing, facing });
    this.ways = new WayBetween({ ...host, player: () => walker.player, face });
    this.card = new MouthsCardView({ go: (route, lamp) => this.begin(route, lamp), close: () => this.closeCard() });
    // The door is the room module's own; with none (a build without passages) nothing of them is offered.
    void host.module.then((module) => {
      try {
        this.door = startPassageDoor(module);
      } catch {
        this.door = null;
      }
    });
  }

  /** The week's web of `island`, asked once; null where it has none or the door cannot read it. */
  private webOf(island: string, week: number): PassageWeb | null {
    const key = `${island}:${week}`;
    if (!this.webs.has(key)) {
      let web: PassageWeb | null = null;
      try {
        web = this.door?.web(island, week) ?? null;
      } catch (error) {
        console.warn(`the passages of ${island} in week ${week} do not read:`, error);
      }
      this.webs.set(key, web);
    }
    return this.webs.get(key) ?? null;
  }

  /** The web whose mouths stand in the patrol zone `node`, this week by the rooms' clock; null for one with none. */
  private mouthsWeb(node: NodeInfo): PassageWeb | null {
    const web = this.webOf(node.continent, weekOf(this.host.now()));
    return web?.patrol === node.id ? web : null;
  }

  /** The player's gear as their room last said it, online or alone: a dive is played alone too. */
  private gear(foot = this.host.foot()): GearState | null {
    return foot ? (foot.held.gear ?? foot.held.alone) : null;
  }

  /** The zone stood in from now; what a respawn lost is judged afresh in it. */
  private setZone(zone: InZone | null): void {
    this.zone = zone;
    [this.carried, this.wasDown] = [0, false];
    // A lantern carried in already (a rejoin, a reload) was found before: its moment is not played again.
    this.lanternHeld = haulOf(this.gear()?.dive?.haul).lantern;
  }

  private seen(): PassageSeenState | null {
    return this.host.foot()?.held.passage ?? null;
  }

  /** What E does at the passages where the player stands, for the foot's frame. */
  readonly uses = (): Uses | null => {
    const foot = this.host.foot();
    if (!foot || !this.door) return null;
    if (this.zone && foot.node.id === this.zone.entry.room) return (x, y, ask) => this.zoneUse(x, y, ask);
    const web = this.mouthsWeb(foot.node);
    if (!web) return null;
    const runs = this.host.land().layouts.find((layout) => layout.id === foot.node.id)?.runs ?? [];
    return (x, y) => {
      const door = mouthAt(web, runs, x, y);
      if (!door) return null;
      const sealed = runs.find((run) => run.name === door.run)?.door ?? [x, y];
      const opened = () => void this.openCard(web, door.mouth, door.run, [sealed[0], sealed[1]]);
      return { words: 'Into the passages', run: opened };
    };
  };

  private zoneUse(x: number, y: number, ask: (asked: GearAsk) => void): ReturnType<Uses> {
    const { plan } = this.zone?.entry ?? {};
    const seen = this.seen();
    this.sign = null;
    if (!plan || !this.zone) return null;
    // E let go of ends a hold under way, as a gather's does.
    if (seen?.holding && !this.useHeld && !this.letGo) ask({ kind: ASKS.stopGather });
    this.letGo = !!seen?.holding && !this.useHeld;
    const held = holdAt(plan, x, y);
    if (held && 'lamp' in held) {
      const lit = seen?.lampLit ?? false;
      const prompt = lampPrompt(lit, !lit && !(seen?.done ?? false));
      if (lit) return { words: prompt.deed, run: () => this.home(ask) };
      const share = seen?.holding?.target === HOLDING_LAMP ? seen.holding.share : undefined;
      if (prompt.under === 'Not while its guard stands')
        return { words: prompt.under, run: () => undefined, idle: true };
      return { words: prompt.deed, run: () => ask({ kind: ASKS.lightLamp }), held: share };
    }
    if (held && 'kindle' in held) {
      if (((seen?.lit ?? 0) >> held.kindle) & 1) return null;
      const share = seen?.holding?.target === held.kindle ? seen.holding.share : undefined;
      return { words: 'Light the dead lamp', run: () => ask({ kind: ASKS.kindle, column: held.kindle }), held: share };
    }
    const mouth = onwardAt(plan, x, y);
    const to = mouth === null ? undefined : this.zone.web.zones.find((each) => each.number === plan.zone.onward[mouth]);
    if (mouth === null || !to) return null;
    const open = seen?.open ?? false;
    this.sign = onwardSign(to, open, this.gear()?.level ?? null, this.litLamps(this.zone.web.island));
    if (!open) return { words: 'Shut', run: () => undefined, idle: true };
    return { words: `On to ${inSentence(to.name)}`, run: () => this.goOn(mouth, ask) };
  }

  /** The lamps the player lit this week on `island`, by number. */
  private litLamps(island: string): readonly number[] {
    return this.gear()?.islandLamps?.find((each) => each.island === island)?.lamps ?? [];
  }

  private async openCard(web: PassageWeb, mouth: number, run: string, door: readonly [number, number]): Promise<void> {
    const foot = this.host.foot();
    const company = (await this.host.companyPlaces()).length > 0;
    const choice = mouthsChoice(web, run, company, this.litLamps(web.island), this.gear()?.level ?? null);
    if (!choice || !foot || this.host.foot() !== foot) return;
    [this.mouth, this.cardAt] = [mouth, { foot, door }];
    this.card.show(choice);
  }

  private closeCard(): void {
    [this.mouth, this.cardAt] = [null, null];
    this.card.hide();
  }

  /** The card closes once its place is left: another room, another flow (the ship, the map), or walked away. */
  private keepCard(foot: Foot | null): void {
    const opened = this.cardAt;
    if (!opened) return;
    const { body } = this.host.context.walker.player;
    const away = Math.hypot(body.x - opened.door[0], body.y - opened.door[1]) > MOUTH_REACH_M + CARD_REACH_M;
    if (foot !== opened.foot || this.host.flow().mode !== 'foot' || away) this.closeCard();
  }

  /** The card's choice: a dive begun at its mouth by `route`, at the mouth or at lamp `lamp`. */
  private begin(route: Route, lamp: number | null): void {
    const [foot, mouth] = [this.host.foot(), this.mouth];
    this.closeCard();
    const web = foot && this.mouthsWeb(foot.node);
    if (!foot || !web || mouth === null) return;
    const first = lamp === null ? web.mouths[mouth]?.zone : web.zones.find((zone) => zone.lamp === lamp)?.number;
    const plan = this.laidOrTold(web.island, web.week, first);
    if (!plan) return;
    const runs = this.host.land().layouts.find((layout) => layout.id === foot.node.id)?.runs;
    const door = runs?.find((each) => each.name === web.mouths[mouth]?.run)?.door;
    const asked = { kind: ASKS.beginDive, column: mouth, slot: route === 'public' ? 0 : 1, node: lamp ?? 0 };
    this.ask(foot, asked, (dive) => this.onward(dive, foot.node, { plan, mouth: door }));
  }

  /** Zone `number` of `island`'s web in `week` laid, or null with the player told why: a way is asked of the room only
   *  once the zone it goes to is laid, so a yes never leaves the player where the dive has gone on from. */
  private laidOrTold(island: string, week: number, number: number | undefined): PassagePlan | null {
    let plan: PassagePlan | null = null;
    try {
      plan = number === undefined ? null : (this.door?.plan(island, week, number) ?? null);
    } catch (error) {
      console.warn(`zone ${number} of the passages of ${island} in week ${week} does not lay:`, error);
    }
    if (!plan) this.host.tell(NOT_LAID);
    return plan;
  }

  private goOn(mouth: number, ask: (asked: GearAsk) => void): void {
    const [foot, entry] = [this.host.foot(), this.zone?.entry];
    if (!foot || !entry) return;
    const plan = this.laidOrTold(entry.island, entry.week, entry.plan.zone.onward[mouth]);
    if (!plan) return;
    const laid = { plan, mouth: entry.plan.sites.onward[mouth]?.at };
    this.ask(foot, { kind: ASKS.goOn, column: mouth }, (dive) => this.onward(dive, entry.patrol, laid), ask);
  }

  private home(ask: (asked: GearAsk) => void): void {
    const foot = this.host.foot();
    const zone = this.zone;
    if (!foot || !zone) return;
    const dive = this.gear()?.dive;
    const mouth = dive?.mouth ?? 0;
    const tier = TIERS[dive?.seas ?? 0];
    // Turned homeward already by an earlier Home at this lamp: the dive has nothing to change, so the room's yes
    // would never be seen, and the way home is open.
    if (dive?.homeward) return this.homeTo(zone, mouth, tier);
    this.ask(foot, { kind: ASKS.goHome }, () => this.homeTo(zone, mouth, tier), ask);
  }

  /** Sends `asked`, its yes (a dive changed: begun, gone on, turned homeward or ended) doing `yes`. */
  private ask(foot: Foot, asked: GearAsk, yes: Asked['yes'], ask = (sent: GearAsk) => foot.fight.askGear(sent)): void {
    const gear = this.gear(foot);
    if (this.asked || !gear) return;
    const since = this.host.now() / 1000;
    this.asked = { foot, kind: asked.kind, answered: gear.answered, dive: gear.dive ?? null, since, yes };
    ask(asked);
  }

  /** Into the zone the dive is in now, the way played from the patrol zone or the zone left: `laid` is the zone laid
   *  before the ask, and the mouth walked into, in the frame the player stands in. */
  private onward(
    dive: DiveState<GearItem> | null,
    patrol: NodeInfo,
    laid: { readonly plan: PassagePlan; readonly mouth?: readonly [number, number] },
  ): void {
    if (!dive || !this.door) return;
    const web = this.webOf(dive.island, dive.week);
    const plan = laid.plan.zone.number === dive.zone ? laid.plan : this.door.plan(dive.island, dive.week, dive.zone);
    const zone = web?.zones.find((each) => each.number === dive.zone);
    if (!web || !plan || !zone) return this.host.tell('The passage has shifted.');
    const heights = plan.ground.kind === 'open' ? this.door.heights(dive.island, dive.week, dive.zone) : null;
    const left = this.zone;
    const passed = left ? [...left.passed, left.entry.plan.zone.number] : [];
    const work = async () => {
      const base = passageRoomName(dive.island, dive.week, dive.zone);
      const room =
        dive.route === 1
          ? (sharedRun(base, await this.host.companyPlaces()) ??
            passageRoomName(dive.island, dive.week, dive.zone, runInstance()))
          : base;
      const minute = Math.floor(this.host.now() / 60_000);
      const entry = {
        plan,
        heights,
        island: dive.island,
        week: dive.week,
        room,
        patrol,
        company: dive.route === 1,
        minute,
      };
      const isle = heights && zoneIsle(plan, heights);
      const warmed = isle && this.host.isles.warm(isle);
      await onwardOrBack(() => this.standIn({ web, entry, isle, passed }), left && (() => this.standIn(left)));
      await warmed;
    };
    const happening = { kind: 'onward', node: passageRoomName(dive.island, dive.week, dive.zone) } as const;
    const place = zone.name.replace(/^A /, 'a ');
    const more = { place, back: left ? patrol : undefined, mouth: laid.mouth, open: plan.ground.kind === 'open' };
    this.pass(happening, web, this.comeOf(left, patrol), zone.at, work, more);
  }

  /** Joins the zone `zone` stands for and stands the player there, its dungeon shown under ground. */
  private async standIn(zone: InZone): Promise<void> {
    await this.host.goInto(() => enterZone(this.host.context, zone.entry));
    this.setZone(zone);
    const layout = zoneLayout(zone.entry.plan);
    if (layout) await this.host.showDungeon(layout, this.host.foot()?.node ?? zone.entry.patrol);
  }

  /** Back into the passage zone of the room `room`, as a log-in whose dive's zone held them last resumes there
   *  (`relog.ts`): whether the page lays that zone, its patrol zone on the landmass open, and joined it. */
  async resumeIn(room: string): Promise<boolean> {
    // The door is laid as the module comes, by the first of its waiters.
    await this.host.module;
    const named = passageRoom(room);
    const door = this.door;
    const web = named && this.webOf(named.island, named.week);
    const plan = named && door?.plan(named.island, named.week, named.zone);
    const patrol = web && this.host.land().nodes.find((node) => node.id === web.patrol);
    if (!named || !door || !web || !plan || !patrol) return false;
    const { island, week, zone } = named;
    const heights = plan.ground.kind === 'open' ? door.heights(island, week, zone) : null;
    const minute = Math.floor(this.host.now() / 60_000);
    const entry = { plan, heights, island, week, room, patrol, company: named.run !== null, minute };
    const isle = heights && zoneIsle(plan, heights);
    await this.standIn({ web, entry, isle, passed: [] });
    // Set once joined, so a zone that refuses leaves the flow to Overlook's arrival.
    this.host.setFlow(arriving(room, plan.zone.name));
    return true;
  }

  /** The way come this dive, on the island: the patrol zone's place, each zone passed, and the zone stood in. */
  private comeOf(zone: InZone | null, patrol: NodeInfo): (readonly [number, number])[] {
    if (!zone) return [patrol.centre];
    return [
      patrol.centre,
      ...[...zone.passed, zone.entry.plan.zone.number].flatMap((number) => {
        const passed = zone.web.zones.find((each) => each.number === number);
        return passed ? [passed.at] : [];
      }),
    ];
  }

  /** Home to the patrol zone at the seas the dive began at, before the mouth it began at. */
  private homeTo(zone: InZone, mouth: number, seas?: Difficulty): void {
    const patrol = zone.entry.patrol;
    const run = zone.web.mouths[mouth]?.run;
    const layout = this.host.land().layouts.find((each) => each.id === patrol.id);
    const door = layout?.runs?.find((each) => each.name === run)?.door;
    // Toward the run's end arena, the place named for it, as the room stands one coming home.
    const arena = layout && placesOf(layout).find((place) => place.name === run)?.at;
    const spawn = door ? homeSpot(door, arena ?? door) : (patrol.spawns[0] ?? patrol.centre);
    // Facing away from the door, as the room stands one coming home; online the room's own stand is where they are.
    const facing = door ? Math.atan2(spawn[0] - door[0], -(spawn[1] - door[1])) : 0;
    const work = async () => {
      await this.host.goInto(() => Foot.enter(this.host.context, { ...patrol, spawns: [spawn] }, facing, seas));
      this.setZone(null);
    };
    const more = { place: patrol.name, back: patrol };
    this.pass({ kind: 'home', node: patrol.id }, zone.web, this.comeOf(zone, patrol), patrol.centre, work, more);
  }

  /** Plays the way from `from` to `to` over the island while `work` joins the place gone to, `more` saying the rest
   *  of it (`WayPlayed`); from a zone, its own frame stands at its place. */
  private pass(
    happening: { readonly kind: 'onward' | 'home'; readonly node: string },
    web: PassageWeb,
    come: readonly (readonly [number, number])[],
    to: readonly [number, number],
    work: () => Promise<void>,
    more: Pick<WayPlayed, 'place' | 'back' | 'mouth' | 'open'>,
  ): void {
    // Every zone of the web and the patrol zone, where the way come starts.
    const framed = [...web.zones.map((each) => each.at), ...come.slice(0, 1)];
    const left = this.inZone() ? come[come.length - 1] : undefined;
    const failed = (error: unknown) => (this.setZone(null), Promise.reject(error));
    this.ways.play({ happening, come, to, framed, left, ...more }, () => work().catch(failed));
  }

  /** Each frame on foot, before the foot's own: whether E is held (`useHeld`), the room's answer to an ask awaited,
   *  and a respawn's loss said plainly. */
  frame(useHeld: boolean): void {
    this.useHeld = useHeld;
    const foot = this.host.foot();
    // An ask of a room since left is no ask of the room stood in now.
    if (this.asked && this.asked.foot !== foot) this.asked = null;
    const gear = this.gear(foot);
    const asked = this.asked;
    const late = asked !== null && this.host.now() / 1000 - asked.since > ANSWER_WAIT_S;
    const heard = asked && gear && answerHeard(asked, gear, late);
    if (asked && heard) {
      this.asked = null;
      // After this frame, so the foot's own frame runs on the place it was begun in before the way leaves it.
      if (heard === 'yes') setTimeout(() => asked.yes(gear?.dive ?? null));
      else if (heard === 'unanswered') this.host.tell(UNANSWERED);
      else {
        const begun = asked.kind === ASKS.beginDive && heard.refused === NO_LAMP;
        this.host.tell(begun ? LAMP_NOT_LIT : answerText(heard.refused));
      }
    }
    this.keepCard(foot);
    // A zone left by another way (the ship, a join) is no longer the one a way starts from.
    if (this.zone && foot && this.host.flow().mode === 'foot' && foot.node.id !== this.zone.entry.room)
      this.setZone(null);
    if (!this.zone || foot?.node.id !== this.zone.entry.room) return;
    const down = foot.fallen;
    const haul = haulOf(gear?.dive?.haul);
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
    const gear = this.gear();
    const word = zone && passageWordOf(zone.entry.plan.zone, gear?.dive, this.seen(), gear?.spent.length);
    if (!zone || !word) return null;
    const nodes = zone.entry.plan.pieces.filter((piece) => piece.kind === 'node').length;
    const round = { nodes, public: gear?.dive?.route === 0 };
    return dealTracker(zone.entry.plan.zone, { ...word, ...round }, this.host.now());
  }

  /** What the leave held warns of in a zone while anything is carried. */
  leaveWarning(): string | null {
    return this.inZone() ? leaveWarning(haulOf(this.gear()?.dive?.haul)) : null;
  }

  /** The pieces' state as the deal stands for the player, and the zone's plan; null out of a zone. Above ground the
   *  pieces stand as the islands' kit's modules (`isles`), as plain boxes only while its pack has not come. */
  pieces(): Pieces | null {
    const zone = this.inZone();
    if (!zone) return null;
    const seen = this.seen();
    const boxed = !zone.isle || !this.host.isles.hasKit('passage');
    // Read again only on a new word of the room or the kit come, and kept as it was while they say the same.
    if (this.laid?.zone === zone && this.laid.seen === seen && this.laid.pieces.boxed === boxed)
      return this.laid.pieces;
    const bits = (set: number) => [0, 1, 2, 3, 4, 5, 6, 7].filter((bit) => (set >> bit) & 1);
    const open = seen?.open ? zone.entry.plan.zone.onward.map((unused, place) => place) : [];
    const state = {
      lampLit: seen?.lampLit ?? false,
      openMouths: open,
      kindled: bits(seen?.lit ?? 0),
      broken: bits(seen?.broken ?? 0),
    };
    const done = seen?.done ?? false;
    const key = JSON.stringify([zone.entry.room, state, boxed, done]);
    const kept = this.laid?.zone === zone && this.laid.pieces.key === key ? this.laid.pieces : null;
    const pieces = kept ?? { plan: zone.entry.plan, state, boxed, done, key };
    this.laid = { zone, seen, pieces };
    return pieces;
  }

  /** Whether the player stands in a passage zone, under ground or above, where the held map is the web's. */
  standsIn(): boolean {
    return this.inZone() !== null;
  }

  /** Whether the player stands in a hollow above ground, which is drawn alone, no land round it. */
  inHollow(): boolean {
    return !!this.inZone()?.isle;
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
  readonly map = (): LandSheet | null => {
    const zone = this.inZone();
    if (!zone) return null;
    const { patrol } = zone.entry;
    const level = this.gear()?.level;
    const lit = this.litLamps(zone.web.island);
    const where = {
      here: zone.entry.plan.zone.number,
      come: zone.passed,
      lit,
      ...(level === undefined ? {} : { level }),
    };
    const home = { name: patrol.name, at: patrol.centre };
    const { sheet, you } = passageSheet(zone.web, where, 'The passages', home);
    const { body } = this.host.context.walker.player;
    return { ...sheet, origin: [body.x - you[0], body.y - you[1]] };
  };

  private inZone(): InZone | null {
    return this.zone && this.host.foot()?.node.id === this.zone.entry.room ? this.zone : null;
  }

  /** The card, the way's dots, an onward mouth's sign and the haul. */
  readonly layer = (ui: Interface): Node | null => {
    const card = this.card.layer(ui);
    if (card) return card;
    const dots = this.ways.dots(ui);
    if (dots) return dots;
    if (!this.inZone()) return null;
    const found = this.host.now() / 1000 - this.lanternFound < LANTERN_S;
    const children = [
      this.sign && signNode(this.sign, ui.size),
      found ? lanternNode(ui.size) : null,
      // On a narrow view the lantern found stands a moment where the haul does, in its place.
      found && ui.size.width <= NARROW ? null : haulNode(haulView(haulOf(this.gear()?.dive?.haul)), ui.size),
    ];
    return { width: 'grow', height: 'grow', children: children.filter((child) => child !== null) };
  };
}
