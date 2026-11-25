// The passages as the game plays them: E at a run's sealed door in the patrol zone opens the mouths' card, and its
// choice asks to begin; in a zone, E at an open mouth asks to go on, E held at the lamp lights it (then Home), E held
// at a dead lamp kindles it. The room judges every ask; its yes plays the way between zones while the next room is
// joined. Each frame the zone's deal stands in the tracker, its pieces as the deal stands, the haul on the right and
// an onward mouth's sign on approach.
import type { Shot } from '../camera.ts';
import { type Flow, next } from '../flow.ts';
import { Foot } from '../foot.ts';
import { weekOf } from '../guild/guildLaw.ts';
import type { FootContext, Uses } from '../footPlace.ts';
import { ASKS, type GearAsk, type GearState } from '../../network/gearMessages.ts';
import { HOLDING_LAMP, type DiveState, type PassageSeenState } from '../../network/passageMessages.ts';
import type { GearItem } from '../../network/gearMessages.ts';
import type { NodeLayout } from '../../layout/layouts.ts';
import { answerText } from '../../player/gear.ts';
import type { Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import type { DungeonLayout } from '../dungeonLayout.ts';
import type { Quest } from '../tasks.ts';
import type { NodeInfo } from '../worldData.ts';
import { runInstance, runOf, sharedRun } from '../rooms.ts';
import type { IsleShown } from '../../islands/islePlan.ts';
import { type PassageDoor, type PassagePlan, type PassageWeb, startPassageDoor } from '../../rules/passageRules.ts';
import { enterZone, type ZoneEntry } from './passageEnter.ts';
import { haulOf, passageWordOf } from './passageHeard.ts';
import { haulNode, MouthsCardView, signNode, wayDotsNode } from './passagePanels.ts';
import type { PieceState } from './passagePieces.ts';
import { holdAt, homeSpot, mouthAt, onwardAt, passageRoomName } from './passageReach.ts';
import { type Way, type WayFrame, wayAt, wayClock, wayOf } from './passageWay.ts';
import {
  dealTracker,
  haulView,
  lampPrompt,
  leaveWarning,
  mouthsChoice,
  onwardSign,
  type OnwardSign,
  type Route,
} from './passageWords.ts';
import { withPieces, zoneIsle, zoneLayout } from './passageZone.ts';

/** How long the page waits on the room's answer to an ask of the passages before saying it did not come. */
const ANSWER_WAIT_S = 3;
const UNANSWERED = 'Your room did not answer. Try again.';

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
  /** Where the player's company's members play: none alone. */
  readonly companyPlaces: () => Promise<readonly string[]>;
  readonly climate: (continent: string) => string;
  readonly tell: (words: string) => void;
  /** A way that fails: the player goes back to their ship, told why. */
  readonly failed: (why: string) => void;
  readonly now: () => number;
}

/** An ask of the passages awaiting the room's answer: how many asks the room had answered as it went, the dive as it
 *  stood, when it went, and what its yes does. */
interface Asked {
  readonly answered: number;
  readonly dive: DiveState<GearItem> | null;
  readonly since: number;
  readonly yes: (dive: DiveState<GearItem> | null) => void;
}

/** The zone the player stands in: its web, its entry and the island shown for it above ground. */
interface InZone {
  readonly web: PassageWeb;
  readonly entry: ZoneEntry;
  readonly isle: IsleShown | null;
}

export class PassageGame {
  private readonly host: PassageHost;
  private door: PassageDoor | null = null;
  private readonly webs = new Map<string, PassageWeb | null>();
  private zone: InZone | null = null;
  private asked: Asked | null = null;
  private sign: OnwardSign | null = null;
  private way: { readonly way: Way; seconds: number; frame: WayFrame | null } | null = null;
  /** The patrol zone's mouth whose card stands open. */
  private mouth: number | null = null;
  /** What the haul held while the player stood, to say plainly what a respawn lost. */
  private carried = 0;
  private wasDown = false;
  private useHeld = false;
  /** The hollow shown, its pieces as last laid, and what they were laid for. */
  private shownIsle: { readonly key: string; readonly isle: IsleShown } | null = null;
  readonly card: MouthsCardView;

  constructor(host: PassageHost) {
    this.host = host;
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

  /** The week's web of `island`, asked once; null where it has none. */
  private webOf(island: string, week: number): PassageWeb | null {
    const key = `${island}:${week}`;
    if (!this.webs.has(key)) this.webs.set(key, this.door?.web(island, week) ?? null);
    return this.webs.get(key) ?? null;
  }

  /** The web whose mouths stand in the patrol zone `node`, this week; null for one with none. */
  private mouthsWeb(node: NodeInfo): PassageWeb | null {
    const web = this.webOf(node.continent, weekOf(this.host.now()));
    return web?.patrol === node.id ? web : null;
  }

  private gear(): GearState | null {
    return this.host.foot()?.gear?.gear ?? null;
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
      return { words: 'Into the passages', run: () => void this.openCard(web, door.mouth, door.run) };
    };
  };

  private zoneUse(x: number, y: number, ask: (asked: GearAsk) => void): ReturnType<Uses> {
    const { plan } = this.zone?.entry ?? {};
    const seen = this.seen();
    this.sign = null;
    if (!plan || !this.zone) return null;
    // E let go of ends a hold under way, as a gather's does.
    if (seen?.holding && !this.useHeld) ask({ kind: ASKS.stopGather });
    const held = holdAt(plan, x, y);
    if (held && 'lamp' in held) {
      const lit = seen?.lampLit ?? false;
      const prompt = lampPrompt(lit, !lit && !(seen?.done ?? false));
      if (lit) return { words: prompt.deed, run: () => this.home(ask) };
      const share = seen?.holding?.target === HOLDING_LAMP ? seen.holding.share : undefined;
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
    this.sign = onwardSign(to, open);
    if (!open) return { words: 'Shut', run: () => undefined, idle: true };
    return { words: `On to ${to.name.replace(/^A /, 'a ')}`, run: () => this.goOn(mouth, ask) };
  }

  private async openCard(web: PassageWeb, mouth: number, run: string): Promise<void> {
    const lit = this.gear()?.islandLamps?.find((each) => each.island === web.island)?.lamps ?? [];
    const company = (await this.host.companyPlaces()).length > 0;
    const choice = mouthsChoice(web, run, company, lit);
    if (!choice) return;
    this.mouth = mouth;
    this.card.show(choice);
  }

  private closeCard(): void {
    this.mouth = null;
    this.card.hide();
  }

  /** The card's choice: a dive begun at its mouth by `route`, at the mouth or at lamp `lamp`. */
  private begin(route: Route, lamp: number | null): void {
    const [foot, mouth] = [this.host.foot(), this.mouth];
    this.closeCard();
    if (!foot || mouth === null) return;
    this.ask(foot, { kind: ASKS.beginDive, column: mouth, slot: route === 'public' ? 0 : 1, node: lamp ?? 0 }, (dive) =>
      this.onward(dive, foot.node),
    );
  }

  private goOn(mouth: number, ask: (asked: GearAsk) => void): void {
    const foot = this.host.foot();
    const patrol = this.zone?.entry.patrol;
    if (!foot || !patrol) return;
    this.ask(foot, { kind: ASKS.goOn, column: mouth }, (dive) => this.onward(dive, patrol), ask);
  }

  private home(ask: (asked: GearAsk) => void): void {
    const foot = this.host.foot();
    const zone = this.zone;
    if (!foot || !zone) return;
    const mouth = this.gear()?.dive?.mouth ?? 0;
    this.ask(foot, { kind: ASKS.goHome }, () => this.homeTo(zone, mouth), ask);
  }

  /** Sends `asked`, its yes (a dive changed: begun, gone on or ended) doing `yes`. */
  private ask(foot: Foot, asked: GearAsk, yes: Asked['yes'], ask = (sent: GearAsk) => foot.gear?.ask(sent)): void {
    const gear = foot.gear?.gear;
    if (this.asked || !gear) return;
    this.asked = { answered: gear.answered, dive: gear.dive ?? null, since: this.host.now() / 1000, yes };
    ask(asked);
  }

  /** Into the zone the dive is in now, the way played from the patrol zone or the zone left. */
  private onward(dive: DiveState<GearItem> | null, patrol: NodeInfo): void {
    if (!dive || !this.door) return;
    const web = this.webOf(dive.island, dive.week);
    const plan = this.door.plan(dive.island, dive.week, dive.zone);
    const zone = web?.zones.find((each) => each.number === dive.zone);
    if (!web || !plan || !zone) return this.host.tell('The passage has shifted.');
    const heights = plan.ground.kind === 'open' ? this.door.heights(dive.island, dive.week, dive.zone) : null;
    const from = this.zone?.web.zones.find((each) => each.number === this.zone?.entry.plan.zone.number)?.at;
    const work = async () => {
      const base = passageRoomName(dive.island, dive.week, dive.zone);
      const room =
        dive.route === 1 ? (sharedRun(base, await this.host.companyPlaces()) ?? runOf(base, runInstance())) : base;
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
      const isle = heights && zoneIsle(plan, heights, this.host.climate(dive.island));
      await this.host.goInto(() => enterZone(this.host.context, entry));
      this.zone = { web, entry, isle };
      const layout = zoneLayout(plan);
      if (layout) await this.host.showDungeon(layout, this.host.foot()?.node ?? patrol);
    };
    this.pass(
      { kind: 'onward', node: passageRoomName(dive.island, dive.week, dive.zone) },
      web,
      from ?? patrol.centre,
      zone.at,
      work,
    );
  }

  /** Home to the patrol zone, before the mouth the dive began at. */
  private homeTo(zone: InZone, mouth: number): void {
    const patrol = zone.entry.patrol;
    const run = zone.web.mouths[mouth]?.run;
    const door = this.host
      .land()
      .layouts.find((layout) => layout.id === patrol.id)
      ?.runs?.find((each) => each.name === run)?.door;
    const spawn = door ? homeSpot(door, patrol.centre) : (patrol.spawns[0] ?? patrol.centre);
    const facing = Math.atan2(patrol.centre[0] - spawn[0], -(patrol.centre[1] - spawn[1]));
    const here = zone.web.zones.find((each) => each.number === zone.entry.plan.zone.number)?.at ?? patrol.centre;
    const work = async () => {
      await this.host.goInto(() => Foot.enter(this.host.context, { ...patrol, spawns: [spawn] }, facing));
      this.zone = null;
    };
    this.pass({ kind: 'home', node: patrol.id }, zone.web, here, patrol.centre, work);
  }

  /** Plays the way from `from` to `to` over the island while `work` joins the place gone to. */
  private pass(
    happening: { readonly kind: 'onward' | 'home'; readonly node: string },
    web: PassageWeb,
    from: readonly [number, number],
    to: readonly [number, number],
    work: () => Promise<void>,
  ): void {
    const after = next(this.host.flow(), happening);
    if (after === this.host.flow()) return;
    const eye = this.host.context.walker.player.body;
    const zones = web.zones.map((each) => each.at);
    const way = wayOf({
      from: { eye: [eye.x, eye.y - 4, eye.z + 2.2], look: [eye.x, eye.y, eye.z + 1.4], fov: 1.1 },
      come: [from],
      to,
      framed: zones,
      arrive: { at: [to[0], to[1], 0], facing: 0 },
      viewport: { width: innerWidth, height: innerHeight },
    });
    this.way = { way, seconds: 0, frame: null };
    this.host.setFlow(after);
    this.host.setReady(false);
    document.exitPointerLock();
    work().then(
      () => this.host.setReady(true),
      (error: unknown) => {
        this.way = null;
        this.zone = null;
        this.host.failed(error instanceof Error ? error.message : String(error));
      },
    );
  }

  /** One frame of the way between zones, `seconds` long: the camera's shot, or null once it has played and the place
   *  has come (`ready`), when the flow goes on foot. */
  passing(seconds: number, ready: boolean): Shot | null {
    const playing = this.way;
    if (!playing) return null;
    playing.seconds = wayClock(playing.seconds, seconds, ready);
    const frame = wayAt(playing.way, playing.seconds);
    playing.frame = frame;
    if (frame.beat === 'done' && ready) {
      this.way = null;
      this.host.setFlow(next(this.host.flow(), { kind: 'loaded' }));
      return null;
    }
    return { ...frame.shot, near: 0.5, far: 60_000 };
  }

  /** Each frame on foot, before the foot's own: whether E is held (`useHeld`), the room's answer to an ask awaited,
   *  and a respawn's loss said plainly. */
  frame(useHeld: boolean): void {
    this.useHeld = useHeld;
    const foot = this.host.foot();
    const gear = foot?.gear?.gear ?? null;
    const asked = this.asked;
    if (asked && gear && gear.answered !== asked.answered) {
      this.asked = null;
      const changed = JSON.stringify(gear.dive ?? null) !== JSON.stringify(asked.dive);
      if (gear.answer === 0 && changed) asked.yes(gear.dive ?? null);
      else if (gear.answer !== 0) this.host.tell(answerText(gear.answer));
    } else if (asked && this.host.now() / 1000 - asked.since > ANSWER_WAIT_S) {
      this.asked = null;
      this.host.tell(UNANSWERED);
    }
    if (!this.zone || foot?.node.id !== this.zone.entry.room) return;
    const down = foot.fallen;
    const carried = haulView(haulOf(gear?.dive?.haul)).lines.length;
    if (this.wasDown && !down && this.carried > 0 && carried === 0) this.host.tell('What you carried is lost.');
    if (!down) this.carried = carried;
    this.wasDown = down;
  }

  /** The zone's deal in the tracker, where it stands; null out of a zone. */
  tracker(): Quest | null {
    const zone = this.inZone();
    const word = zone && passageWordOf(zone.entry.plan.zone, this.gear()?.dive, this.seen());
    return zone && word ? dealTracker(zone.entry.plan.zone, word.deal) : null;
  }

  /** What the leave held warns of in a zone while anything is carried. */
  leaveWarning(): string | null {
    return this.inZone() ? leaveWarning(haulOf(this.gear()?.dive?.haul)) : null;
  }

  /** The pieces' state as the deal stands for the player, and the zone's plan; null out of a zone. Above ground the
   *  pieces stand as the islands' kit's modules (`isles`), and only their lights are drawn so. */
  pieces(): { readonly plan: PassagePlan; readonly state: PieceState; readonly lightsOnly: boolean } | null {
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
    return { plan: zone.entry.plan, state, lightsOnly: zone.isle !== null };
  }

  /** The hollow above ground the islands' layer draws while the player stands in it. */
  isles(): readonly IsleShown[] {
    const [zone, pieces] = [this.inZone(), this.pieces()];
    if (!zone?.isle || !pieces) return [];
    const key = JSON.stringify([zone.entry.room, pieces.state, this.seen()?.done ?? false]);
    if (this.shownIsle?.key !== key)
      this.shownIsle = { key, isle: withPieces(zone.isle, pieces.plan, pieces.state, this.seen()?.done ?? false) };
    return [this.shownIsle.isle];
  }

  private inZone(): InZone | null {
    return this.zone && this.host.foot()?.node.id === this.zone.entry.room ? this.zone : null;
  }

  /** The card, the way's dots, an onward mouth's sign and the haul. */
  readonly layer = (ui: Interface): Node | null => {
    const card = this.card.layer(ui);
    if (card) return card;
    if (this.way?.frame) return wayDotsNode(this.way.frame, ui.size, this.way.way.ask.framed);
    if (!this.inZone()) return null;
    const children = [
      this.sign && signNode(this.sign, ui.size),
      haulNode(haulView(haulOf(this.gear()?.dive?.haul)), ui.size),
    ];
    return { width: 'grow', height: 'grow', children: children.filter((child) => child !== null) };
  };
}
