// The passages as the game plays them: E at a run's sealed door in the patrol zone opens the mouths' card
// (mouthsCard.ts), and its choice asks to begin; in a zone, E at an open mouth asks to go on, E held at the lamp
// lights it (then Home), E held at a dead lamp kindles it. The room judges every ask (passageAsks.ts); its yes plays
// the way between zones while the next room is joined. What the zone stood in shows each frame is zoneStood.ts's.
import { arriving, type Flow } from '../flow.ts';
import type { Alone } from '../scene.ts';
import { Foot } from '../foot.ts';
import { weekOf } from '../guild/guildLaw.ts';
import type { FootContext, Uses } from '../footPlace.ts';
import { ASKS, type GearAsk, type GearItem } from '../../network/gearMessages.ts';
import type { DiveState } from '../../network/passageMessages.ts';
import { type NodeLayout, placesOf } from '../../layout/layouts.ts';
import { TIERS } from '../activityWords.ts';
import type { Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import type { DungeonLayout } from '../dungeonLayout.ts';
import type { Quest } from '../tasks.ts';
import type { NodeInfo } from '../worldData.ts';
import { NO_WAY_HERE, passageRoom, passageRoomName, runInstance, sharedRun } from '../rooms.ts';
import type { IsleShown } from '../../islands/islePlan.ts';
import type { Difficulty } from '../../heldmap/heldMap.ts';
import type { LandSheet } from '../../heldmap/landSheet.ts';
import { type PassageDoor, type PassagePlan, type PassageWeb, startPassageDoor } from '../../rules/passageRules.ts';
import { lampCold } from './athericBounty.ts';
import { gearOf, PassageAsks } from './passageAsks.ts';
import { enterZone, onwardOrBack } from './passageEnter.ts';
import { MouthsCard } from './mouthsCard.ts';
import { heldTarget, holdAt, homeSpot, onwardAt } from './passageReach.ts';
import { WayBetween, type WayHost, type WayPlayed } from './wayBetween.ts';
import { inSentence, lampPrompt, onwardSign, type OnwardSign, type Route } from './passageWords.ts';
import { zoneIsle, zoneLayout } from './passageZone.ts';
import { type InZone, lampsLit, type Pieces, ZoneStood } from './zoneStood.ts';
import type { ZoneFoe } from './passageWaypoint.ts';

const NOT_LAID = 'The zone beyond could not be laid, so the way on stays shut.';

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
   *  (never failing). */
  readonly isles: { readonly warm: (isle: IsleShown) => Promise<void> };
  /** Whether a piece's module has come in its pack: above ground (`hollow`) the islands' kit's, else the dungeons'. */
  readonly modelled: (hollow: boolean, module: string) => boolean;
  /** Where the player's company's members play: none alone. */
  readonly companyPlaces: () => Promise<readonly string[]>;
  readonly tell: (words: string) => void;
  /** What a way that fails does, asked as it sets out (`WayHost`). */
  readonly fallback: WayHost['fallback'];
  /** The moment now, milliseconds since 1970, by the rooms' clock (`roomNow`), so the week turns with theirs. */
  readonly now: () => number;
}

export class PassageGame {
  private readonly host: PassageHost;
  private door: PassageDoor | null = null;
  private readonly webs = new Map<string, PassageWeb | null>();
  private readonly asks: PassageAsks;
  /** The zone stood in, and what the page shows of it. */
  readonly stood: ZoneStood;
  private sign: OnwardSign | null = null;
  /** The way between places, shared with the crossings between patrol zones. */
  readonly ways: WayBetween;
  readonly card: MouthsCard;
  private useHeld = false;
  /** Whether E let go of was told the room once already, so it is not told again each frame until it is heard. */
  private letGo = false;

  constructor(host: PassageHost) {
    this.host = host;
    const { walker } = host.context;
    const face = (facing: number) => void (walker.player = { ...walker.player, yaw: facing, facing });
    const body = () => walker.player.body;
    this.ways = new WayBetween({ ...host, player: () => walker.player, face });
    this.asks = new PassageAsks(host.now, host.tell);
    this.stood = new ZoneStood({ ...host, body });
    this.card = new MouthsCard({
      ...{ foot: host.foot, body, companyPlaces: host.companyPlaces },
      onFoot: () => host.flow().mode === 'foot',
      lit: (island) => lampsLit(host.foot(), island),
      level: () => gearOf(host.foot())?.level ?? null,
      go: (route, lamp) => this.begin(route, lamp),
    });
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

  /** What E does at the passages where the player stands, for the foot's frame. */
  readonly uses = (): Uses | null => {
    const foot = this.host.foot();
    if (!foot || !this.door) return null;
    const zone = this.stood.zone;
    if (zone && foot.node.id === zone.entry.room) return (x, y, ask) => this.zoneUse(zone, x, y, ask);
    const web = this.mouthsWeb(foot.node);
    if (!web) return null;
    return this.card.uses(web, this.host.land().layouts.find((layout) => layout.id === foot.node.id)?.runs ?? []);
  };

  private zoneUse(zone: InZone, x: number, y: number, ask: (asked: GearAsk) => void): ReturnType<Uses> {
    const { plan } = zone.entry;
    const seen = this.host.foot()?.held.passage ?? null;
    this.sign = null;
    // E let go of ends a hold under way, as a gather's does.
    if (seen?.holding && !this.useHeld && !this.letGo) ask({ kind: ASKS.stopGather });
    this.letGo = !!seen?.holding && !this.useHeld;
    const held = holdAt(plan, x, y);
    const share = held && seen?.holding?.target === heldTarget(held) ? seen.holding.share : undefined;
    if (held && 'lamp' in held) {
      const lit = seen?.lampLit ?? false;
      const cold = lampCold(gearOf(this.host.foot())?.athericBounties, zone.web.island, plan.zone.lamp ?? 0);
      const prompt = lampPrompt(lit, !lit && !(seen?.done ?? false), cold, plan.zone.onward.length > 0);
      if (lit) return { words: prompt.deed, under: prompt.under, run: () => this.home(ask) };
      if (prompt.under === 'Not while its guard stands')
        return { words: prompt.under, run: () => undefined, idle: true };
      const light = () => this.hold({ kind: ASKS.lightLamp }, ask);
      return { words: prompt.deed, under: prompt.under, run: light, held: share };
    }
    // A dead lamp lit already is used no more: a mouth beside it is.
    if (held && 'kindle' in held && !(((seen?.lit ?? 0) >> held.kindle) & 1)) {
      const kindle = { kind: ASKS.kindle, column: held.kindle };
      return { words: 'Light the dead lamp', run: () => this.hold(kindle, ask), held: share };
    }
    if (held && 'reliquary' in held && !(seen?.done ?? false)) {
      return { words: 'Open the reliquary', run: () => this.hold({ kind: ASKS.open }, ask), held: share };
    }
    const mouth = onwardAt(plan, x, y);
    const to = mouth === null ? undefined : zone.web.zones.find((each) => each.number === plan.zone.onward[mouth]);
    if (mouth === null || !to) return null;
    const open = seen?.open ?? false;
    const gear = gearOf(this.host.foot());
    const far = plan.zone.deal === 'gauntlet' && plan.sites.far === mouth;
    this.sign = onwardSign(to, open, gear?.level ?? null, lampsLit(this.host.foot(), zone.web.island), far);
    if (!open) return { words: 'Shut', run: () => undefined, idle: true };
    return { words: `On to ${inSentence(to.name)}`, run: () => this.goOn(mouth, ask) };
  }

  /** A hold asked of the room, its refusal said. */
  private hold(asked: GearAsk, ask: (asked: GearAsk) => void): void {
    const foot = this.host.foot();
    if (foot) this.asks.hold(foot, asked, ask);
    else ask(asked);
  }

  /** The card's choice: a dive begun at its mouth by `route`, at the mouth or at lamp `lamp`. */
  private begin(route: Route, lamp: number | null): void {
    const [foot, mouth] = [this.host.foot(), this.card.mouth];
    this.card.close();
    const web = foot && this.mouthsWeb(foot.node);
    if (!foot || !web || mouth === null) return;
    // At a lamp, the lamp's zones' one at the mouth's place among the mouths, or the last, as the room begins it.
    const lamps = web.zones.filter((zone) => zone.lamp === lamp);
    const first = lamp === null ? web.mouths[mouth]?.zone : lamps[Math.min(mouth, lamps.length - 1)]?.number;
    const plan = this.laidOrTold(web.island, web.week, first);
    if (!plan) return;
    const runs = this.host.land().layouts.find((layout) => layout.id === foot.node.id)?.runs;
    const door = runs?.find((each) => each.name === web.mouths[mouth]?.run)?.door;
    const asked = { kind: ASKS.beginDive, column: mouth, slot: route === 'public' ? 0 : 1, node: lamp ?? 0 };
    this.asks.ask(foot, asked, (dive) => this.onward(dive, foot.node, { plan, mouth: door }));
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
    const [foot, entry] = [this.host.foot(), this.stood.zone?.entry];
    if (!foot || !entry) return;
    const plan = this.laidOrTold(entry.island, entry.week, entry.plan.zone.onward[mouth]);
    if (!plan) return;
    const laid = { plan, mouth: entry.plan.sites.onward[mouth]?.at };
    this.asks.ask(foot, { kind: ASKS.goOn, column: mouth }, (dive) => this.onward(dive, entry.patrol, laid), ask);
  }

  private home(ask: (asked: GearAsk) => void): void {
    const foot = this.host.foot();
    const zone = this.stood.zone;
    if (!foot || !zone) return;
    const dive = gearOf(foot)?.dive;
    const mouth = dive?.mouth ?? 0;
    const tier = TIERS[dive?.seas ?? 0];
    // Turned homeward already by an earlier Home at this lamp: the dive has nothing to change, so the room's yes
    // would never be seen, and the way home is open.
    if (dive?.homeward) return this.homeTo(zone, mouth, tier);
    this.asks.ask(foot, { kind: ASKS.goHome }, () => this.homeTo(zone, mouth, tier), ask);
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
    let plan: PassagePlan | null = laid.plan;
    try {
      if (laid.plan.zone.number !== dive.zone) plan = this.door.plan(dive.island, dive.week, dive.zone);
    } catch (error) {
      console.warn(`zone ${dive.zone} of the passages of ${dive.island} in week ${dive.week} does not lay:`, error);
      plan = null;
    }
    const zone = web?.zones.find((each) => each.number === dive.zone);
    if (!web || !plan || !zone) return this.host.tell('The passage has shifted.');
    const heights = plan.ground.kind === 'open' ? this.door.heights(dive.island, dive.week, dive.zone) : null;
    const left = this.stood.zone;
    const passed = left ? [...left.passed, left.entry.plan.zone.number] : [];
    const come = this.stood.comeOf(patrol);
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
      const wentOn = await onwardOrBack(
        () => this.standIn({ web, entry, isle, passed }),
        left && (() => this.standIn(left)),
      );
      // Back in the zone left, the player is told why in the zone gone to's own words.
      if (!wentOn) this.host.tell(NO_WAY_HERE);
      await warmed;
    };
    const happening = { kind: 'onward', node: passageRoomName(dive.island, dive.week, dive.zone) } as const;
    const place = zone.name.replace(/^A /, 'a ');
    const more = { place, back: left ? patrol : undefined, mouth: laid.mouth, open: plan.ground.kind === 'open' };
    this.pass(happening, web, come, zone.at, work, more);
  }

  /** Joins the zone `zone` stands for and stands the player there, its dungeon shown under ground. */
  private async standIn(zone: InZone): Promise<void> {
    await this.host.goInto(() => enterZone(this.host.context, zone.entry));
    this.stood.set(zone);
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
      this.stood.set(null);
    };
    const more = { place: patrol.name, back: patrol };
    this.pass({ kind: 'home', node: patrol.id }, zone.web, this.stood.comeOf(patrol), patrol.centre, work, more);
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
    const left = this.stood.inZone() ? come[come.length - 1] : undefined;
    const failed = (error: unknown) => (this.stood.set(null), Promise.reject(error));
    this.ways.play({ happening, come, to, framed, left, ...more }, () => work().catch(failed));
  }

  /** Each frame on foot, before the foot's own: whether E is held (`useHeld`), the room's answer to an ask awaited,
   *  the card kept or closed, and the zone stood in. */
  frame(useHeld: boolean): void {
    this.useHeld = useHeld;
    const foot = this.host.foot();
    this.asks.frame(foot);
    this.card.keep(foot);
    this.stood.frame(foot, this.host.flow().mode === 'foot');
  }

  tracker(): Quest | null {
    return this.stood.tracker();
  }

  /** Where the compass points in a zone, at what its deal asks next; null out of one. */
  waypoint(foes: readonly ZoneFoe[]): readonly [number, number] | null {
    return this.stood.waypoint(foes);
  }

  leaveWarning(): string | null {
    return this.stood.leaveWarning();
  }

  pieces(): Pieces | null {
    return this.stood.pieces();
  }

  /** Whether the player stands in a passage zone, under ground or above, where the held map is the web's. */
  standsIn(): boolean {
    return this.stood.inZone() !== null;
  }

  /** Whether the player stands in a hollow above ground, which is drawn alone, no land round it. */
  inHollow(): boolean {
    return !!this.stood.inZone()?.isle;
  }

  hollowAir(): Alone | null {
    return this.stood.hollowAir();
  }

  isles(): readonly IsleShown[] {
    return this.stood.isles();
  }

  readonly map = (): LandSheet | null => this.stood.map();

  /** The card, the way's dots, and in a zone an onward mouth's sign and the haul. */
  readonly layer = (ui: Interface): Node | null =>
    this.card.view.layer(ui) || this.ways.dots(ui) || this.stood.layer(ui, this.sign);
}
