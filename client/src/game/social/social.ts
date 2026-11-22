// The game's social pieces, drawn as a layer of their own over the HUD: the chat, the menu holding Use on another
// player opens, and the Inspect it opens. The game's frames hand it the other players each frame on foot and whether
// Use is held; the keys open the chat. It keeps its state here, as the menu's window keeps its own.
import type { AccountLink, Details, Roster } from '../../network/accounts.ts';
import type { OtherPlayers } from '../../player/others.ts';
import { uiScale } from '../../ui/uiRenderer.ts';
import type { Node } from '../../ui/node.ts';
import type { Stack } from '../../ui/stack.ts';
import type { Interface } from '../../ui/ui.ts';
import { DETAILS_BACK, detailsNode } from '../playerDetails.ts';
import { sizesOf } from '../gearNodes.ts';
import { rosterNow } from '../companyHud.ts';
import { ACCOUNT_CHANGED } from '../gearScreen.ts';
import { charge } from '../uiSounds.ts';
import { promptChip } from '../usePrompt.ts';
import { type Channel, EARSHOT_M, HELP, readTyped, refusedWords } from '../../../../server/accounts/chatLaw.ts';
import { ChatLink } from './chatLink.ts';
import { ChatLog } from './chatLog.ts';
import { ChatPanel, type Relation } from './chatPanel.ts';
import { type InteractRow, interactNode, interactRows } from './interactMenu.ts';
import type { PlatedPlayer, PlayerPlates } from '../../combat/playerPlates.ts';

/** How long Use is held on a player before their menu opens, in seconds: DFO's hold for a player's menu. */
export const HOLD_S = 0.45;
/** What a page with no accounts, or a guest, is told of what needs a username. */
const NO_ROSTER = 'Add a username in Settings';
const ALONE = 'You are playing alone: no one hears the chat.';

type Point = readonly [number, number, number];

class Social {
  readonly log = new ChatLog();
  readonly panel = new ChatPanel();
  private readonly link: ChatLink | null;
  private readonly accounts: AccountLink | null;
  /** Where each named player stands this frame, and the player's own feet: whom a Local line is heard from. */
  private standing = new Map<string, Point>();
  private own: Point | null = null;
  /** The menu up for a player, its rows once the Roster answers, and what the last ask answered. */
  private menu: { player: PlatedPlayer; rows: readonly InteractRow[] | null; said: string } | null = null;
  /** The player being inspected, and their details once the accounts answer (or why not). */
  private inspected: { name: string; details: Details | string | null } | null = null;
  /** When Use began to be held on the player aimed at, was held last frame, and what stops the hold's sound. */
  private held: { since: number; name: string } | null = null;
  private wasHeld = false;
  private quiet: () => void = () => undefined;
  /** Use offered on a player this frame: beside the mark round them, and how far it is held; drawn once. */
  private prompt: { readonly x: number; readonly y: number; readonly held: number | null } | null = null;

  constructor(accounts: AccountLink | null, session: () => Promise<string | null>) {
    this.accounts = accounts;
    const heard = (said: Parameters<ConstructorParameters<typeof ChatLink>[2]>[0]) => {
      const now = performance.now();
      if ('line' in said) this.log.heard(said.line, now, this.link?.name ?? null, (name) => this.near(name));
      else if ('told' in said) this.log.told(said.told, now);
    };
    this.link = accounts ? new ChatLink(accounts.chatAt, session, heard) : null;
    void this.link?.start();
    addEventListener(ACCOUNT_CHANGED, () => this.link?.restart());
  }

  /** Whether a player named `name` stands near enough to be heard. */
  private near(name: string): boolean {
    const there = this.standing.get(name);
    const own = this.own;
    return !!there && !!own && Math.hypot(there[0] - own[0], there[1] - own[1]) <= EARSHOT_M;
  }

  /** Every other player as their plate is drawn, kept to say whom a Local line is heard from. */
  plated(others: OtherPlayers, own: Point | null): PlatedPlayer[] {
    const roster = rosterNow();
    const company = new Set((roster?.company?.members ?? []).map((member) => member.name.toLowerCase()));
    const players: PlatedPlayer[] = [];
    for (const [id, placed] of others.placed) {
      const plate = others.plateOf(id);
      if (!plate) continue;
      const feet: Point = [placed.x, placed.y, placed.z];
      players.push({ id, feet, plate, company: company.has(plate.name.toLowerCase()) });
    }
    this.standing = new Map(
      players.filter((each) => each.plate.name !== '').map((each) => [each.plate.name, each.feet]),
    );
    this.own = own;
    return players;
  }

  /** Use held on the player `plates` aims at, while it is `able` (nothing else within Use's reach, no menu up): its
   *  hold shown beside them, and their menu opened once it is held long enough. */
  hold(plates: PlayerPlates, able: boolean, held: boolean, clock: number): void {
    const aimed = able ? plates.aimed : null;
    const began = held && !this.wasHeld;
    this.wasHeld = held;
    if (!aimed || !held || (this.held && this.held.name !== aimed.plate.name)) this.letGo();
    if (aimed && began) {
      this.held = { since: clock, name: aimed.plate.name };
      this.quiet = charge(HOLD_S * 1000);
    }
    const share = this.held ? Math.min(1, (clock - this.held.since) / HOLD_S) : null;
    plates.offer = aimed ? { held: share } : null;
    const mark = plates.markAt;
    this.prompt = aimed && mark ? { x: mark.x + mark.height / 2 + 8, y: mark.y, held: share } : null;
    if (aimed && share !== null && share >= 1) {
      this.letGo();
      this.interact(aimed);
    }
  }

  private letGo(): void {
    this.held = null;
    this.quiet();
    this.quiet = () => undefined;
  }

  /** Opens the menu for `player`, asking the Roster what may be done with them. */
  interact(player: PlatedPlayer): void {
    document.exitPointerLock();
    const menu = { player, rows: null as readonly InteractRow[] | null, said: '' };
    this.menu = menu;
    const accounts = this.accounts;
    const none = accounts ? NO_ROSTER : 'Play online to ask the Roster';
    if (!accounts) return void (menu.rows = interactRows(null, null, none));
    void Promise.all([accounts.roster(), accounts.details(player.plate.name)]).then(([roster, found]) => {
      if (this.menu !== menu) return;
      const known = typeof roster === 'string' ? null : (roster as Roster);
      const person = typeof found === 'string' ? null : found;
      menu.rows = interactRows(known, person, typeof roster === 'string' ? roster : none);
    });
  }

  /** A row of the menu chosen: the Roster asked, the chat opened to whisper, or the player inspected. */
  private chosen(row: InteractRow): void {
    const menu = this.menu;
    if (!menu) return;
    const name = menu.player.plate.name;
    if (row.key === 'whisper') {
      this.menu = null;
      this.panel.show('whisper', name);
      return;
    }
    if (row.key === 'inspect') return this.inspect(name);
    const accounts = this.accounts;
    if (!accounts || !row.path) return;
    menu.said = '...';
    void accounts.social(row.path, row.body ?? {}).then((refused) => {
      menu.said = refused ?? `${row.label}: done.`;
      dispatchEvent(new Event('overlook:company'));
      this.interact(menu.player);
      if (this.menu) this.menu.said = menu.said;
    });
  }

  private inspect(name: string): void {
    this.menu = null;
    const inspected = { name, details: null as Details | string | null };
    this.inspected = inspected;
    const accounts = this.accounts;
    if (!accounts) return void (inspected.details = 'Play online to inspect another player.');
    void accounts.details(name).then((found) => {
      if (this.inspected === inspected) inspected.details = found;
    });
  }

  /** Whether the menu or Inspect is up, which pauses the player as a menu does and takes the keys. */
  get up(): boolean {
    return this.menu !== null || this.inspected !== null;
  }

  /** Who a name is to the player, for its colour in the chat. */
  private relation(name: string): Relation {
    if (name === this.link?.name) return 'mine';
    const roster = rosterNow();
    if (roster?.company?.members.some((member) => member.name === name)) return 'company';
    return roster?.friends.some((friend) => friend.name === name) ? 'friend' : 'other';
  }

  /** What a line typed in the chat asks, done: said to the hall, the channel changed, or a notice. */
  private say(typed: string): 'shut' | 'keep' | 'clear' {
    const now = performance.now();
    const panel = this.panel;
    const read = readTyped(typed, panel.channel, panel.to ?? undefined);
    if (read.kind === 'help') {
      for (const line of HELP) this.log.told(line, now);
      return 'clear';
    }
    if (read.kind === 'unknown' || read.kind === 'empty') {
      this.log.told(refusedWords(read), now);
      return 'keep';
    }
    if (read.kind === 'switch') {
      [panel.channel, panel.to] = [read.channel, read.to ?? null];
      return 'clear';
    }
    const to = read.kind === 'reply' ? this.log.lastWhisperer : read.to;
    const channel: Channel = read.kind === 'reply' ? 'whisper' : read.channel;
    if (channel === 'whisper' && !to) {
      this.log.told('No one has whispered to you yet.', now);
      return 'keep';
    }
    const said = channel === 'whisper' ? { say: read.words, channel, to: to ?? '' } : { say: read.words, channel };
    if (!this.link) this.log.told(ALONE, now);
    else if (!this.link.say(said)) this.log.told('The chat is joining. Try again in a moment.', now);
    return 'shut';
  }

  /** The layer this frame: the chat, and over it the menu or Inspect while one is up. */
  node(ui: Interface): Node {
    const view = ui.size;
    const chat = this.panel.node(
      ui,
      this.log,
      performance.now(),
      view,
      (name) => this.relation(name),
      (typed) => this.say(typed),
    );
    const menu = this.menu;
    const shut = () => {
      this.menu = null;
    };
    const over = menu
      ? interactNode(ui, menu.player, menu.rows, menu.said, (row) => this.chosen(row), shut)
      : this.inspectNode(ui, view);
    const prompt = this.prompt;
    this.prompt = null;
    const offered: Node | null = prompt && {
      ...promptChip('Interact', prompt.held),
      float: { to: 'screen', anchor: [0, 0.5], x: prompt.x, y: prompt.y },
    };
    return { width: 'grow', height: 'grow', through: !this.up, children: [offered, chat, over] };
  }

  /** Inspect over the view: the player's details as the Roster shows them, or why not yet. */
  private inspectNode(ui: Interface, view: { readonly width: number; readonly height: number }): Node | null {
    const inspected = this.inspected;
    if (!inspected) return null;
    const back = () => {
      this.inspected = null;
    };
    if (ui.escaped) back();
    const { details } = inspected;
    const sizes = sizesOf(view.width, view.height, uiScale(devicePixelRatio));
    const room = { width: Math.min(view.width - 32, 760), height: view.height - 32 };
    const page =
      details !== null && typeof details !== 'string'
        ? detailsNode({ ui, room, sizes }, details, back)
        : { role: 'panel' as const, padding: [16, 18] as const, children: [{ text: { words: details ?? '...' } }] };
    if (typeof details === 'string' && ui.clicked(DETAILS_BACK)) back();
    return {
      width: 'grow',
      height: 'grow',
      alignX: 'center',
      alignY: 'center',
      fill: 'rgba(0,0,0,0.5)',
      solid: true,
      children: [{ id: 'inspect', modal: true, scroll: true, maxHeight: view.height - 32, children: [page] }],
    };
  }
}

let social: Social | null = null;

/** Starts the social pieces as a layer of `stack`, the chat joining the hall of `accounts` with the page's session. */
export function startSocial(stack: Stack, accounts: AccountLink | null, session: () => Promise<string | null>): void {
  const started = new Social(accounts, session);
  social = started;
  stack.add((ui) => started.node(ui));
}

/** Opens the chat's field, on its channel as it was. */
export function openChat(): void {
  social?.panel.show();
}

/** Whether the menu for a player or Inspect is up: the player is paused, as in a menu, and the keys are its own. */
export const socialUp = (): boolean => social?.up ?? false;

/** Every other player's plate this frame on foot, the player's own feet at `own`. */
export const platedPlayers = (others: OtherPlayers, own: Point | null): PlatedPlayer[] =>
  social?.plated(others, own) ?? [];

/** Use held (`held`) on the player the plates aim at, while it is `able`, at the frames' `clock`. */
export function holdOnPlayer(plates: PlayerPlates, able: boolean, held: boolean, clock: number): void {
  social?.hold(plates, able, held, clock);
}
