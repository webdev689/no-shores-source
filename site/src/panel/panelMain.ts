// The bot's panel on the website: sign in with Discord, pick a server, see the bot's state, change a module's
// settings, read who changed what. The bot decides what each person may see and do; the page only draws the answer.
import { type Level, atLeast } from '../../../server/bot/law/access.ts';
import { avatarUrl, serverIconUrl } from '../../../server/bot/law/message.ts';
import { BOT_MODULES, moduleOf } from '../../../server/bot/law/modules.ts';
import type { FieldError } from '../../../server/bot/law/settings.ts';
import type { Channel, ComposerTools, FormContext, Role, ServerEmoji } from './context.ts';
import { answerWords, button, element, linkButton, para, when, windowOf } from './dom.ts';
import { bindForm } from './form.ts';
import { type Answer, type PanelApi, createPanelApi } from './panelApi.ts';
import { moduleParts } from './parts.ts';
import { picturesSection } from './pictures.ts';
import { auditPage, leaderboardPage } from './records.ts';

/** The words for a sign-in that came back with an error. */
const SIGN_IN_ERRORS: Readonly<Record<string, string>> = {
  'login-off': 'Sign-in is not set up yet.',
  denied: 'Discord sign-in was cancelled.',
  rate: 'Too many sign-ins from here. Wait a minute and try again.',
  storage: 'Your browser blocks the site data that sign-in needs. Allow site data for this site, then sign in again.',
};
export const LEVEL_WORDS: Readonly<Record<string, string>> = {
  viewer: 'Viewer',
  moderator: 'Moderator',
  manager: 'Manager',
  owner: 'Owner',
};
const STATE_WORDS: Readonly<Record<string, string>> = {
  ready: 'Connected',
  idle: 'Not started',
  connecting: 'Connecting',
  identifying: 'Signing in',
  resuming: 'Resuming',
  waiting: 'Reconnecting',
  fatal: 'Stopped',
};
/** A server's id as Discord writes it. */
const SNOWFLAKE = /^\d{5,25}$/;

interface User {
  readonly id?: string;
  readonly username?: string;
  readonly globalName?: string;
  readonly avatar?: string | null;
}
interface Me {
  readonly user?: User;
  readonly owner?: boolean;
  readonly guilds?: ReadonlyArray<{ readonly id: string; readonly name: string; readonly level: string }>;
}
interface Gateway {
  readonly state?: string;
  readonly latencyMs?: number;
  readonly readyAt?: number;
  readonly lastError?: string;
}
interface Overview {
  readonly guild: {
    readonly id: string;
    readonly name: string;
    readonly icon?: string | null;
    readonly memberCount?: number;
  };
  readonly level: Level;
  readonly gateway?: Gateway | null;
  readonly modules: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly blurb: string;
    readonly group: string;
    readonly enabled: boolean;
    readonly canEdit: boolean;
  }>;
  readonly channels: readonly Channel[];
  readonly roles: readonly Role[];
  readonly emojis?: readonly ServerEmoji[];
}
interface Saved {
  readonly config: Record<string, unknown>;
  readonly enabled: boolean;
  readonly rev: number;
  readonly updatedAt?: number;
  readonly canEdit: boolean;
  readonly preview?: { readonly cardUrl?: string };
  readonly note?: string;
}

/** What every page of the panel draws with: the bot, the root, whether its route still stands, and the frame. */
export interface PanelView {
  readonly api: PanelApi;
  /** Whether the route that drew a page is still the current one. */
  readonly stands: (asked: number) => boolean;
  readonly routeNow: () => number;
  readonly show: (children: ReadonlyArray<Node | string>) => void;
  readonly bar: () => HTMLElement;
  readonly fail: (answer: { status: number; body: { message?: unknown } | null }) => void;
}

/** This page's address, where Discord's round trip comes back to. */
const pageAddress = (): string => `${location.origin}${location.pathname}`;

let api: PanelApi;
let root: HTMLElement;
let signedIn: Me | null = null;
/** While a page holds changes not saved: whether the person agrees to leave it. */
let mayLeave: (() => boolean) | null = null;
/** While a page holds changes not saved: whether it does now. */
let unsaved: (() => boolean) | null = null;
/**
 * Moves on every route: a page whose answers come back after the person moved on draws nothing, so a slow server's
 * page never stands under another server's address, and its Save never reaches the wrong server.
 */
let routeNo = 0;

const nameOf = (user: User | undefined): string => user?.globalName || user?.username || '';

function show(children: ReadonlyArray<Node | string>): void {
  root.replaceChildren(...children);
  root.focus({ preventScroll: true });
}

/** The bar over every signed-in page: who is signed in, the way back to the servers, and sign-out. */
function bar(): HTMLElement {
  const name = nameOf(signedIn?.user);
  return element('div', { class: 'topline' }, [
    element('a', { class: 'wordmark', href: '#' }, ['No Shores bot']),
    element('span', { class: 'who' }, [name ? `Signed in as ${name}` : '']),
    button('Sign out', async () => {
      // changes not saved are asked about before anything is undone; then the address change routes, once
      if (mayLeave && !mayLeave()) return;
      mayLeave = null;
      unsaved = null;
      await api.signOut();
      signedIn = null;
      if (location.hash) location.hash = '';
      else void route();
    }),
  ]);
}

function signInPage(error = ''): void {
  const words = error ? (SIGN_IN_ERRORS[error] ?? 'Sign-in did not finish. Try again.') : '';
  // the press marks this tab as the one the ticket comes back to
  const door = linkButton('Sign in with Discord', api.signInUrl(pageAddress()), 'button button-gold button-big');
  door.addEventListener('click', () => api.beginSignIn());
  show([
    windowOf('The No Shores bot', [
      ...(words ? [element('p', { class: 'warn', role: 'alert' }, [words])] : []),
      element('div', { class: 'doors' }, [door]),
      element('p', { class: 'small' }, ['The bot asks Discord who you are, and nothing else.']),
    ]),
  ]);
}

function failPage(answer: { status: number; body: { message?: unknown } | null }): void {
  show([bar(), windowOf('Something went wrong', [para(answerWords(answer)), linkButton('Back', '#')])]);
}

const view: PanelView = {
  get api() {
    return api;
  },
  stands: (asked) => asked === routeNo,
  routeNow: () => routeNo,
  show,
  bar,
  fail: failPage,
};

async function loadMe(): Promise<boolean> {
  if (signedIn) return true;
  const asked = routeNo;
  const answer = await api.call<Me>('GET', '/v1/panel/me');
  if (asked !== routeNo) return false;
  if (!answer.ok) {
    if (answer.status === 401) signInPage();
    else failPage(answer);
    return false;
  }
  signedIn = answer.body;
  return true;
}

function serversPage(): void {
  const guilds = signedIn?.guilds ?? [];
  const cards = guilds.map((guild) =>
    element('div', { class: 'tile' }, [
      element('h3', {}, [guild.name]),
      para(LEVEL_WORDS[guild.level] ?? guild.level),
      linkButton('Open', `#g=${guild.id}`),
    ]),
  );
  const none = 'You cannot manage any server the bot is in. Ask a server owner to give your role panel access.';
  show([bar(), windowOf('Your servers', [cards.length ? element('div', { class: 'grid' }, cards) : para(none)])]);
}

async function gatewayAct(action: 'restart' | 'stop'): Promise<void> {
  const answer = await api.call('POST', '/v1/panel/gateway', { action });
  if (!answer.ok) failPage(answer);
  else void route();
}

function gatewayPanel(gateway: Gateway | null | undefined, owner: boolean): HTMLElement {
  const lines = gateway
    ? [
        para(`State: ${STATE_WORDS[gateway.state ?? ''] ?? gateway.state ?? ''}`),
        para(`Latency: ${gateway.latencyMs ? `${gateway.latencyMs} ms` : 'not measured yet'}`),
        para(`Last connected: ${when(Math.floor((gateway.readyAt || 0) / 1000))}`),
        ...(gateway.lastError ? [element('p', { class: 'warn' }, [gateway.lastError])] : []),
      ]
    : [para('The bot did not say how its connection is.')];
  const stop = (): void => {
    if (window.confirm('Stop the bot until someone restarts it?')) void gatewayAct('stop');
  };
  const acts = owner
    ? [
        element('div', { class: 'acts' }, [
          button('Restart', () => void gatewayAct('restart'), 'button button-small'),
          button('Stop', stop, 'button button-small'),
        ]),
      ]
    : [];
  return element('div', { class: 'tile' }, [element('h3', {}, ['Connection']), ...lines, ...acts]);
}

const tile = (title: string, words: string, href: string): HTMLElement =>
  element('div', { class: 'tile' }, [element('h3', {}, [title]), para(words), linkButton('Open', href)]);

async function overviewPage(guildId: string): Promise<void> {
  const asked = routeNo;
  const answer = await api.call<Overview>('GET', `/v1/panel/g/${guildId}`);
  if (asked !== routeNo) return;
  if (!answer.ok) return failPage(answer);
  const server = answer.body;
  const groups = [...new Set(BOT_MODULES.map((shape) => shape.group))];
  const groupWindows = groups.flatMap((group) => {
    const shown = server.modules.filter((shape) => shape.group === group);
    if (!shown.length) return [];
    const cards = shown.map((shape) =>
      element('div', { class: 'tile' }, [
        element('h3', {}, [shape.title]),
        para(shape.blurb),
        element('p', { class: shape.enabled ? 'on' : 'off' }, [shape.enabled ? 'On' : 'Off']),
        linkButton(shape.canEdit ? 'Change' : 'View', `#g=${guildId}&m=${shape.id}`),
      ]),
    );
    return [windowOf(group, [element('div', { class: 'grid' }, cards)])];
  });
  const members = server.guild.memberCount ?? 0;
  show([
    bar(),
    windowOf(server.guild.name, [
      para(`${members.toLocaleString('en')} members. You are ${LEVEL_WORDS[server.level] ?? server.level}.`),
      element('div', { class: 'grid' }, [
        gatewayPanel(server.gateway, signedIn?.owner === true),
        tile('Audit log', 'Every change made here or by the bot.', `#g=${guildId}&audit`),
        tile('Pictures', "Pictures uploaded for this server's messages.", `#g=${guildId}&pictures`),
      ]),
    ]),
    ...groupWindows,
  ]);
}

/** What a message composer may ask of the bot on this page: a test sent where the person says, and a picture kept. */
const composerTools = (guildId: string, moduleId: string): ComposerTools => ({
  async sendTest(message, to) {
    const answer = await api.call('POST', `/v1/panel/g/${guildId}/test-message`, { module: moduleId, message, to });
    return { ok: answer.ok, message: answerWords(answer) };
  },
  async upload(file) {
    const answer = await api.call<{ url?: string; message?: string }>('POST', `/v1/panel/g/${guildId}/media`, file);
    return { ok: answer.ok, url: answer.ok ? answer.body.url : undefined, message: answerWords(answer) };
  },
});

/** The words a save's answer leaves under the form. */
function saveWords(result: Answer<Saved>, mark: (errors: readonly FieldError[]) => FieldError[]): string {
  if (result.ok) return result.body.note ? `Saved. ${result.body.note}` : 'Saved.';
  if (result.body.error !== 'invalid') return answerWords(result);
  const left = mark(result.body.errors ?? []);
  return left.length ? left.map((error) => `${error.path}: ${error.message}`).join(' ') : 'Some settings need a fix.';
}

async function modulePage(guildId: string, moduleId: string): Promise<void> {
  const shape = moduleOf(moduleId);
  if (!shape) return failPage({ status: 404, body: { message: 'There is no such module.' } });
  const asked = routeNo;
  const [overview, answer] = await Promise.all([
    api.call<Overview>('GET', `/v1/panel/g/${guildId}`),
    api.call<Saved>('GET', `/v1/panel/g/${guildId}/m/${moduleId}`),
  ]);
  if (asked !== routeNo) return;
  if (!overview.ok) return failPage(overview);
  if (!answer.ok) return failPage(answer);
  const saved = answer.body;
  const disabled = !saved.canEdit;
  const guild = overview.body.guild;
  const preview = {
    guildName: guild.name,
    guildIcon: serverIconUrl(guild.id, guild.icon),
    memberCount: guild.memberCount ?? 0,
    me: { name: nameOf(signedIn?.user) || 'Member', avatar: avatarUrl(signedIn?.user) },
    cardUrl: saved.preview?.cardUrl ?? '',
  };
  const formContext: FormContext = {
    channels: overview.body.channels,
    roles: overview.body.roles,
    emojis: overview.body.emojis ?? [],
    disabled,
    // what a message's preview fills its placeholders with: this server, the person signed in, and the bot's card
    preview,
    tools: disabled ? {} : composerTools(guildId, moduleId),
  };
  const form = bindForm(shape.schema, saved.config, formContext);
  const status = element('p', { class: 'status', role: 'status' });
  const enabled = element('input', { id: 'module-on', type: 'checkbox' });
  enabled.checked = saved.enabled;
  enabled.disabled = disabled;
  let rev = saved.rev;
  const stateNow = (): string => JSON.stringify({ config: form.read(), enabled: enabled.checked });
  let savedState = stateNow();
  unsaved = () => !disabled && stateNow() !== savedState;
  mayLeave = () => !unsaved?.() || window.confirm('This page has changes that are not saved. Leave it?');
  const save = button('Save', async () => {
    // one save at a time: a second press would carry the same revision and be refused as stale
    save.disabled = true;
    status.textContent = 'Saving...';
    const sent = stateNow();
    const body = { config: form.read(), enabled: shape.alwaysOn ? true : enabled.checked, rev };
    const result = await api.call<Saved>('PUT', `/v1/panel/g/${guildId}/m/${moduleId}`, body);
    if (result.ok) {
      rev = result.body.rev;
      savedState = sent;
      form.mark([]);
      // a saved welcome card looks new: its address changes, and the previews draw it
      if (result.body.preview?.cardUrl !== undefined) {
        preview.cardUrl = result.body.preview.cardUrl;
        form.refresh();
      }
    }
    save.disabled = false;
    status.textContent = saveWords(result, form.mark);
  });
  save.disabled = disabled;
  const lists = { channels: overview.body.channels, roles: overview.body.roles };
  const parts = moduleParts(api, guildId, shape, overview.body.level, lists);
  const onSwitch = element('div', { class: 'field inline-check' }, [
    enabled,
    element('label', { for: 'module-on' }, ['On']),
  ]);
  show([
    bar(),
    windowOf(shape.title, [
      para(shape.blurb),
      ...(shape.alwaysOn ? [] : [onSwitch]),
      form.element,
      element('div', { class: 'acts' }, [...(disabled ? [] : [save]), linkButton('Back', `#g=${guildId}`)]),
      status,
      element('p', { class: 'small' }, [
        saved.updatedAt ? `Last saved ${when(saved.updatedAt)}.` : 'Never saved: these are the defaults.',
      ]),
    ]),
    ...(parts.actions.length ? [windowOf('Act', [element('div', { class: 'grid' }, parts.actions)])] : []),
    ...(parts.views.length ? [windowOf('Records', parts.views)] : []),
  ]);
}

/** A server's uploaded pictures. */
async function picturesPage(guildId: string): Promise<void> {
  const asked = routeNo;
  const answer = await api.call<Overview>('GET', `/v1/panel/g/${guildId}`);
  if (asked !== routeNo) return;
  if (!answer.ok) return failPage(answer);
  const canEdit = atLeast(answer.body.level, 'manager');
  show([bar(), windowOf('Pictures', [picturesSection(api, guildId, canEdit), linkButton('Back', `#g=${guildId}`)])]);
}

async function route(): Promise<void> {
  const mine = ++routeNo;
  // the sign-in comes back in the fragment, which never reaches a server: read as a query of its own
  const fragment = new URLSearchParams(location.hash.slice(1));
  const ticket = fragment.get('ticket');
  if (ticket) {
    window.history.replaceState(null, '', location.pathname);
    const done = await api.exchange(ticket);
    if (mine !== routeNo) return;
    if (!done.ok) return signInPage(done.body.error === 'storage' ? 'storage' : 'ticket');
    return route();
  }
  const board = fragment.get('lb') ?? '';
  if (SNOWFLAKE.test(board)) return leaderboardPage(view, board);
  const error = fragment.get('error');
  if (error) {
    window.history.replaceState(null, '', location.pathname);
    return signInPage(error);
  }
  if (!api.signedIn()) return signInPage();
  const guildId = fragment.get('g') ?? '';
  // the servers' list is read afresh each time it is shown: a role given or taken since changes it
  if (!SNOWFLAKE.test(guildId)) signedIn = null;
  if (!(await loadMe()) || mine !== routeNo) return;
  if (!SNOWFLAKE.test(guildId)) return serversPage();
  const moduleId = fragment.get('m');
  if (moduleId) return modulePage(guildId, moduleId);
  if (fragment.has('audit')) return auditPage(view, guildId);
  if (fragment.has('pictures')) return picturesPage(guildId);
  return overviewPage(guildId);
}

/** Run the panel in this page, drawn into `target`: the bot's address, and the route the address names. */
export function startPanel(target: HTMLElement | null): void {
  if (!target) return;
  api = createPanelApi({ local: ['localhost', '127.0.0.1'].includes(location.hostname) });
  void api.finishSignOut();
  root = target;
  window.addEventListener('hashchange', (event) => {
    // leaving a page with changes not saved asks first; staying puts the address back without a reload
    if (mayLeave && !mayLeave()) {
      window.history.replaceState(null, '', event.oldURL);
      return;
    }
    mayLeave = null;
    unsaved = null;
    void route();
  });
  window.addEventListener('beforeunload', (event) => {
    if (!unsaved?.()) return;
    event.preventDefault();
    // older browsers ask only when this is set
    event.returnValue = '';
  });
  void route();
}
