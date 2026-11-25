// The game's social pieces, drawn as a layer of their own over the HUD: the chat, the menu holding Use on another
// player opens, and the Inspect it opens. The game's frames hand it the other players each frame on foot, where it is
// at sea, and whether Use is held; the keys open the chat. It keeps its state here, as the menu's window keeps its own.
import type { AccountLink, Roster } from '../../network/accounts.ts';
import type { Cards } from '../../player/cards.ts';
import type { GearState } from '../../network/gearMessages.ts';
import type { OtherPlayers } from '../../player/others.ts';
import { announce } from '../../ui/announce.ts';
import type { Node } from '../../ui/node.ts';
import type { Stack } from '../../ui/stack.ts';
import type { Interface } from '../../ui/ui.ts';
import { rosterNow } from '../companyHud.ts';
import { ACCOUNT_CHANGED } from '../gearScreen.ts';
import type { FootContext } from '../foot.ts';
import { rulesOf } from '../footRoom.ts';
import { setItemRules } from '../itemStats.ts';
import { charge } from '../uiSounds.ts';
import { promptChip } from '../usePrompt.ts';
import {
  type Channel,
  EARSHOT_M,
  type FromHall,
  HELP,
  NAME_MOST,
  readTyped,
  refusedWords,
} from '../../../../server/accounts/chatLaw.ts';
import { ChatLink } from './chatLink.ts';
import { ChatLog } from './chatLog.ts';
import { ChatPanel, type Relation } from './chatPanel.ts';
import { type InteractRow, interactNode, interactRows, pressOf } from './interactMenu.ts';
import { type Inspected, InspectWindow } from './inspectWindow.ts';
import type { PlatedPlayer, PlayerPlates } from '../../combat/playerPlates.ts';

/** How long Use is held on a player before their menu opens, in seconds: DFO's hold for a player's menu; and how long
 *  the aim may slip off them without letting the hold go, as a walking body or a bobbing view takes it off a moment. */
const HOLD_S = 0.45;
const HOLD_SLIP_S = 0.2;
/** What a page with no accounts, or a guest, is told of what needs a username. */
const NO_ROSTER = 'Add a username in Settings';
const ALONE = 'You are playing alone: no one hears the chat.';
/** How far from the view's edge the Interact chip keeps, and how wide it stands at most, in CSS pixels. */
const CHIP_EDGE = 12;
const CHIP_WIDE = 170;
/** A username, as a Whisper or a mute names one. */
const USERNAME = new RegExp(`^\\w{1,${NAME_MOST}}$`);

type Point = readonly [number, number, number];

class Social {
  log = new ChatLog();
  readonly panel = new ChatPanel();
  private readonly link: ChatLink | null;
  private readonly accounts: AccountLink | null;
  private readonly inspectWindow: InspectWindow;
  /** Where each named player stands this frame on foot, their dress, and the player's own feet: whom a Local line is
   *  heard from, and how one inspected is drawn. Empty off land. */
  private standing = new Map<string, { readonly feet: Point; readonly id: number }>();
  private own: Point | null = null;
  private others: OtherPlayers | null = null;
  /** The menu up for a player, its rows once the Roster answers, what the last ask answered, and whether one is out. */
  private menu: { player: PlatedPlayer; rows: readonly InteractRow[] | null; said: string; busy: boolean } | null =
    null;
  /** Whether the menu's first press is yet to be given the focus. */
  private focusMenu = false;
  private inspected: Inspected | null = null;
  /** The hold of Use on a player: on whom, since when, and when they were last aimed at; and whether Use was held last
   *  frame, the frames' clock then, and what stops the hold's sound. */
  private held: { since: number; name: string; seen: number } | null = null;
  private wasHeld = false;
  private lastClock = 0;
  private quiet: () => void = () => undefined;
  /** Use offered on a player this frame: beside the mark round them, and how far it is held; drawn once. */
  private prompt: { readonly x: number; readonly y: number; readonly held: number | null } | null = null;
  private offeredTo: string | null = null;

  constructor(accounts: AccountLink | null, session: () => Promise<string | null>, forge: () => Cards | null) {
    this.accounts = accounts;
    this.inspectWindow = new InspectWindow(forge);
    const heard = (said: FromHall) => this.heard(said);
    this.link = accounts ? new ChatLink(accounts.chatAt, session, heard) : null;
    void this.link?.start();
    // Another account's lines, and whom it whispered with, are not this one's to read back or answer.
    addEventListener(ACCOUNT_CHANGED, () => {
      this.log = new ChatLog();
      [this.panel.channel, this.panel.to] = ['local', null];
      this.link?.restart();
    });
    // While a player's menu or Inspect is up, the keys are theirs alone: the interface heard them first, and nothing
    // of the game's (the pause menu, the gear's window, the sheet) opens over them.
    addEventListener(
      'keydown',
      (event) => {
        if (this.up) event.stopImmediatePropagation();
      },
      true,
    );
  }

  /** Sets Inspect's pieces beside the player's own, from `mine`. */
  compareWith(mine: () => GearState | null): void {
    this.inspectWindow.mine = mine;
  }

  private heard(said: FromHall): void {
    const now = performance.now();
    if ('told' in said) return this.log.told(said.told, now);
    if (!('line' in said)) return;
    const mine = this.link?.name ?? null;
    if (said.line.from !== mine && this.mutes(said.line.from)) return;
    this.log.heard(said.line, now, mine, (name) => this.near(name));
  }

  /** Whether the player mutes `name`, as the Roster last said; a mute or unmute asks it again at once. */
  private mutes(name: string): boolean {
    return rosterNow()?.muted?.includes(name) ?? false;
  }

  /** Whether a player named `name` stands near enough to be heard. */
  private near(name: string): boolean {
    const there = this.standing.get(name)?.feet;
    const own = this.own;
    return !!there && !!own && Math.hypot(there[0] - own[0], there[1] - own[1]) <= EARSHOT_M;
  }

  /** Every other player as their plate is drawn on foot, kept to say whom a Local line is heard from. */
  plated(others: OtherPlayers, own: Point | null): PlatedPlayer[] {
    const roster = rosterNow();
    const company = new Set((roster?.company?.members ?? []).map((member) => member.name.toLowerCase()));
    const players: PlatedPlayer[] = [];
    const standing = new Map<string, { feet: Point; id: number }>();
    for (const [id, placed] of others.placed) {
      const plate = others.plateOf(id);
      if (!plate) continue;
      const feet: Point = [placed.x, placed.y, placed.z];
      players.push({ id, feet, plate, company: company.has(plate.name.toLowerCase()) });
      if (plate.name !== '') standing.set(plate.name, { feet, id });
    }
    [this.standing, this.own, this.others] = [standing, own, others];
    this.panel.place(false, null);
    return players;
  }

  /** At sea, in `water`: no one stands near enough for Local, and the chat says Region in its place. */
  atSea(water: string | null): void {
    [this.standing, this.own, this.others] = [new Map(), null, null];
    this.panel.place(true, water);
  }

  /** Use held on the player `plates` aims at, while it is `able` (nothing else within Use's reach, no menu up): its
   *  hold shown beside them, and their menu opened once it is held long enough. */
  hold(plates: PlayerPlates, able: boolean, held: boolean, clock: number, view: { readonly width: number }): void {
    const aimed = able ? plates.aimed : null;
    const began = held && !this.wasHeld;
    // A frame long missed (the mode changed meanwhile) lets a hold go, so none carries over into another.
    const jumped = clock - this.lastClock > 0.25;
    [this.wasHeld, this.lastClock] = [held, clock];
    const kept = this.held;
    const slipped = kept && (aimed ? aimed.plate.name !== kept.name : clock - kept.seen > HOLD_SLIP_S);
    if (!held || jumped || slipped) this.letGo();
    if (aimed && began) {
      this.held = { since: clock, name: aimed.plate.name, seen: clock };
      this.quiet = charge(HOLD_S * 1000);
    }
    if (aimed && this.held) this.held.seen = clock;
    const share = this.held && aimed ? Math.min(1, (clock - this.held.since) / HOLD_S) : null;
    plates.offer = aimed ? { held: share } : null;
    const mark = plates.markAt;
    const x = mark ? mark.x + mark.height / 2 + 8 : 0;
    const left = x + CHIP_WIDE > view.width - CHIP_EDGE && mark ? mark.x - mark.height / 2 - 8 - CHIP_WIDE : x;
    this.prompt = aimed && mark ? { x: Math.max(CHIP_EDGE, left), y: mark.y, held: share } : null;
    const name = aimed?.plate.name ?? null;
    if (name !== null && name !== this.offeredTo) announce(`Interact with ${name}`);
    this.offeredTo = name;
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
  interact(player: PlatedPlayer, said = ''): void {
    if (!this.menu) {
      document.exitPointerLock();
      this.focusMenu = true;
    }
    const menu = { player, rows: null as readonly InteractRow[] | null, said, busy: false };
    this.menu = menu;
    const accounts = this.accounts;
    if (!accounts) return void (menu.rows = interactRows(null, null, 'Play online to ask the Roster'));
    void Promise.all([accounts.roster(), accounts.details(player.plate.name)]).then(([roster, found]) => {
      if (this.menu !== menu) return;
      const known = typeof roster === 'string' ? null : (roster as Roster);
      // One stood before the player plays where they do, though their details keep where they are to their friends.
      const person = typeof found === 'string' ? null : { ...found, place: found.place ?? known?.me?.place ?? null };
      const why = typeof roster === 'string' ? roster : typeof found === 'string' ? found : NO_ROSTER;
      menu.rows = interactRows(known, person, why);
    });
  }

  /** A row of the menu chosen: the Roster asked, the chat opened to whisper, or the player inspected. */
  private chosen(row: InteractRow): void {
    const menu = this.menu;
    if (!menu || menu.busy) return;
    const name = menu.player.plate.name;
    if (row.key === 'whisper') {
      this.menu = null;
      this.panel.show('whisper', name);
      return;
    }
    if (row.key === 'inspect') return this.inspect(menu.player);
    const accounts = this.accounts;
    if (!accounts || !row.path) return;
    [menu.said, menu.busy] = ['...', true];
    void accounts.social(row.path, row.body ?? {}).then((refused) => {
      const said = refused ?? `${row.label}: done.`;
      announce(said);
      dispatchEvent(new Event('overlook:company'));
      // The menu shut meanwhile stays shut.
      if (this.menu === menu) this.interact(menu.player, said);
    });
  }

  /** Inspect over the player's menu, which Back returns to. */
  private inspect(player: PlatedPlayer): void {
    const name = player.plate.name;
    const dress = this.others?.dressOf(player.id) ?? null;
    const inspected: Inspected = { name, details: null, dress };
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

  /** What a line typed in the chat asks, done: said to the hall, the channel changed, a mute, or a notice. A line that
   *  cannot be said now stays in the field. */
  private say(typed: string): 'shut' | 'keep' | 'clear' {
    const now = performance.now();
    const told = (words: string, after: 'keep' | 'clear' = 'keep') => (this.log.told(words, now), after);
    const panel = this.panel;
    const read = readTyped(typed, panel.channel, panel.to ?? undefined);
    if (read.kind === 'help') {
      for (const line of HELP) this.log.told(line, now);
      return 'clear';
    }
    if (read.kind === 'unknown' || read.kind === 'empty') return told(refusedWords(read));
    if (read.kind === 'mute' || read.kind === 'unmute') return this.muteByName(read.name, read.kind === 'mute');
    if (read.kind === 'switch') {
      if (read.to !== undefined && !USERNAME.test(read.to)) return told(`${read.to} is no player's name.`);
      [panel.channel, panel.to] = [read.channel, read.to ?? null];
      return 'clear';
    }
    const to = read.kind === 'reply' ? this.log.lastWhisperer : read.to;
    const channel: Channel = read.kind === 'reply' ? 'whisper' : read.channel;
    if (channel === 'whisper' && !to) return told('No one has whispered to you yet.');
    if (channel === 'whisper' && to && !USERNAME.test(to)) return told(`${to} is no player's name.`);
    const said = channel === 'whisper' ? { say: read.words, channel, to: to ?? '' } : { say: read.words, channel };
    if (!this.link) return told(ALONE);
    if (this.link.say(said)) return 'shut';
    // One the hall let go joins again as the player speaks: the cause (another tab, a session ended) may be gone.
    if (this.link.state === 'refused') this.link.restart();
    return told(JOINING);
  }

  /** Mutes or unmutes a player by name, as the Roster does. */
  private muteByName(name: string, mute: boolean): 'clear' | 'keep' {
    const now = performance.now();
    if (!USERNAME.test(name)) return (this.log.told(`${name} is no player's name.`, now), 'keep');
    const accounts = this.accounts;
    if (!accounts) return (this.log.told('Play online to mute a player.', now), 'keep');
    void accounts.social(mute ? 'mute' : 'unmute', { name }).then((refused) => {
      if (refused === null) dispatchEvent(new Event('overlook:company'));
      this.log.told(refused ?? `${mute ? 'Muted' : 'Unmuted'} ${name}.`, performance.now());
    });
    return 'clear';
  }

  /** The layer this frame: the chat, the Interact chip, and over them the menu or Inspect while one is up. */
  node(ui: Interface): Node {
    const view = ui.size;
    const relation = (name: string) => this.relation(name);
    const chat = this.panel.node(ui, this.log, performance.now(), view, relation, (typed) => this.say(typed));
    const menu = this.menu;
    const shut = () => {
      this.menu = null;
    };
    let over: Node | null = null;
    if (this.inspected) {
      over = this.inspectWindow.node(ui, view, this.inspected, () => {
        [this.inspected, this.focusMenu] = [null, true];
      });
    } else if (menu) {
      over = interactNode(ui, menu.player, menu.rows, menu.said, menu.busy, (row) => this.chosen(row), shut);
      const first = menu.rows?.find((row) => !row.why);
      if (this.focusMenu && first) {
        ui.focusOn(pressOf(first.key));
        this.focusMenu = false;
      }
    }
    const prompt = this.prompt;
    this.prompt = null;
    const offered: Node | null = prompt && {
      ...promptChip('Interact', prompt.held),
      float: { to: 'screen', anchor: [0, 0.5], x: prompt.x, y: prompt.y },
    };
    return { width: 'grow', height: 'grow', children: [offered, chat, over] };
  }
}

const JOINING = 'The chat is joining. Say it again in a moment.';

let social: Social | null = null;

/** Starts the social pieces as a layer of `stack`, the chat joining the hall of `accounts` with the page's session,
 *  and Inspect drawing with the forge `forge` gives. */
export function startSocial(
  stack: Stack,
  accounts: AccountLink | null,
  session: () => Promise<string | null>,
  forge: () => Cards | null,
): void {
  const started = new Social(accounts, session, forge);
  social = started;
  stack.add((ui) => started.node(ui));
}

/** Sets each piece another player wears, on Inspect, beside the piece of `mine` worn in its slot; and gives the gear's
 *  pages the rules the player's fighter is predicted by, to ask items' fight numbers of. */
export function inspectAgainst(context: Pick<FootContext, 'roomModule'>, mine: () => GearState | null): void {
  rulesOf(context).then(
    ({ combat }) => setItemRules(combat),
    (error: unknown) => console.error('the gear pages have no rules to ask items’ numbers of:', error),
  );
  social?.compareWith(mine);
}

/** Opens the chat's field, on its channel as it was. */
export function openChat(): void {
  social?.panel.show();
}

/** Whether the menu for a player or Inspect is up: the player is paused, as in a menu, and the keys are its own. */
export const socialUp = (): boolean => social?.up ?? false;

/** Whether the chat's field is open, so the pad, as the keys, plays nothing of the game's. */
export const chatOpen = (): boolean => social?.panel.open ?? false;

/** Every other player's plate this frame on foot, the player's own feet at `own`. */
export const platedPlayers = (others: OtherPlayers, own: Point | null): PlatedPlayer[] =>
  social?.plated(others, own) ?? [];

/** The player is at sea, their ship in `water` (null between waters or before it puts to sea). */
export function chatAtSea(water: string | null): void {
  social?.atSea(water);
}

/** Use held (`held`) on the player the plates aim at, while it is `able`, at the frames' `clock`, in a view `view`. */
export function holdOnPlayer(
  plates: PlayerPlates,
  able: boolean,
  held: boolean,
  clock: number,
  view: { readonly width: number },
): void {
  social?.hold(plates, able, held, clock, view);
}
