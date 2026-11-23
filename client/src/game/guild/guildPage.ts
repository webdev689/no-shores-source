// The Guild tab: the player's guild as Destiny 2's clan screen shows a clan (`guildHome.ts`), the banner editor, the
// guild's details, and founding one for a player in no guild. It asks the accounts for the guild and the Roster, and
// again now and then while it is seen. Each ask goes one at a time; a guild founded, joined or left tells the room, so
// the player's plate wears the new tag.

import type { AccountLink, GuildFace, Roster } from '../../network/accounts.ts';
import { ASKS, type GearAsk } from '../../network/gearMessages.ts';
import { announce } from '../../ui/announce.ts';
import type { Node } from '../../ui/node.ts';
import { GUILD_CHANGED } from '../gearScreen.ts';
import { INK, pressNode, words } from '../gearNodes.ts';
import type { PlainContext } from '../menuPage.ts';
import { hintNode } from '../menuPages.ts';
import { BannerEditor } from './bannerEditor.ts';
import { type Banner, bannerFrom, bannerOfName } from './bannerLaw.ts';
import { detailsNode, FIELDS, foundNode } from './guildDetails.ts';
import { EDGE, edgeId, homeNode, type Home, type RosterTurn } from './guildHome.ts';
import { bountiesNode, contributionNode } from './guildWeek.ts';

/** How often the guild is asked for again while it is seen, in milliseconds. */
const LOOK_MS = 15_000;
/** How long after a claim the guild is asked for again: once the room has saved the claim. */
const CLAIM_SAVED_MS = 2_500;
/** What the tab shows: its home, the banner editor, or the guild's details. */
type View = 'home' | 'banner' | 'details';
/** The asks that change which guild a player is in, after which the room reads their tag again. */
const MOVES = /^guild\/(found|accept|leave)$/;
export const AGAIN_ID = 'guild-again';

/** The page's services, given by the menu. */
export interface GuildWith {
  readonly link: AccountLink;
  /** The room the player is in, asked as the menu's presses ask it; none offline. */
  readonly here?: () => { ask(ask: GearAsk): void } | null;
  readonly now?: () => number;
  /** Whether the page is out of sight (its tab hidden), when the guild is not asked again. */
  readonly hidden?: () => boolean;
}

/** The Guild tab, kept across frames while the menu is open. */
export class GuildPage {
  private face: GuildFace | null = null;
  private roster: Roster | null = null;
  private failure: string | null = null;
  private looked = false;
  private lookedAt = Number.NEGATIVE_INFINITY;
  private asked = 0;
  private busy = false;
  private said = '';
  private view: View = 'home';
  private editor: BannerEditor | null = null;
  /** The banner a guild being founded will hang, made in the editor before it exists. */
  private founding: Banner | null = null;
  private readonly turn: RosterTurn = { page: 0 };
  private readonly link: AccountLink;
  private readonly here: () => { ask(ask: GearAsk): void } | null;
  private readonly now: () => number;
  private readonly hidden: () => boolean;

  constructor(given: GuildWith) {
    this.link = given.link;
    this.here = given.here ?? (() => null);
    this.now = given.now ?? Date.now;
    this.hidden = given.hidden ?? (() => false);
    this.look();
  }

  /** Asks for the guild and the Roster again, keeping only the latest answer. */
  look(): void {
    const asked = ++this.asked;
    this.lookedAt = this.now();
    void Promise.all([this.link.guild(), this.link.roster()]).then(([guild, roster]) => {
      if (asked !== this.asked) return;
      this.looked = true;
      this.failure = typeof guild === 'string' ? guild : typeof roster === 'string' ? roster : null;
      if (typeof guild !== 'string') this.face = guild.guild;
      if (typeof roster !== 'string') this.roster = roster;
    });
  }

  /** Escape's step on this tab: back to its home from another of its pages; false when it is home already. */
  back(): boolean {
    if (this.view === 'home') return false;
    this.view = 'home';
    this.editor = null;
    return true;
  }

  /** The guild's banner as kept, or the one its name draws. */
  private bannerOf(face: GuildFace): Banner {
    return bannerFrom(face.banner) ?? bannerOfName(face.name);
  }

  /** Sends an ask of the guild, one at a time, and asks for the guild again once it is answered. */
  private ask(path: string, body: Readonly<Record<string, unknown>>, said: string): void {
    if (this.busy) return;
    this.busy = true;
    void this.link
      .social(path, body)
      .then((why) => {
        this.say(why ?? said);
        if (why !== null) return;
        if (MOVES.test(path)) {
          dispatchEvent(new Event(GUILD_CHANGED));
          this.view = 'home';
          this.founding = null;
        }
        if (path === 'guild/banner') this.back();
        for (const [id] of Object.values(FIELDS)) this.clearField(id);
      })
      .finally(() => {
        this.busy = false;
        this.look();
      });
  }

  private ui: PlainContext['ui'] | null = null;
  private clearField(id: string): void {
    this.ui?.setFieldText(id, '');
  }

  private say(said: string): void {
    this.said = said;
    announce(said);
  }

  /** The page this frame. */
  node(context: PlainContext): Node {
    const { ui } = context;
    this.ui = ui;
    if (this.now() - this.lookedAt >= LOOK_MS && !this.hidden() && this.view === 'home') this.look();
    if (!this.looked)
      return { width: 'grow', padding: 24, children: [words('Asking for your guild...', 1, INK.faint)] };
    if (this.failure !== null && this.face === null)
      return {
        width: 'grow',
        direction: 'column',
        gap: 12,
        padding: 24,
        children: [hintNode(this.failure), pressNode(AGAIN_ID, 'Try again')],
      };
    if (ui.clicked(AGAIN_ID)) this.look();
    const face = this.face;
    const named = ui.fieldText(FIELDS.name[0]).trim() || 'Guild';
    if (this.view === 'banner' && this.editor) {
      // A founding's name and tag wait in their fields while its banner is made.
      ui.fieldText(FIELDS.tag[0]);
      return this.editorNode(context, face);
    }
    if (!face) {
      const banner = this.founding ?? bannerOfName(named);
      return {
        width: 'grow',
        direction: 'column',
        gap: 10,
        children: [
          foundNode(context, this.roster, banner, this.ask.bind(this), () => this.openEditor(banner, named, true)),
          this.said !== '' && words(this.said, 1, INK.answer, { wrap: true }),
        ],
      };
    }
    if (this.view === 'details')
      return {
        width: 'grow',
        direction: 'column',
        gap: 10,
        children: [
          detailsNode(context, face, context.holds, this.ask.bind(this)),
          this.said !== '' && words(this.said, 1, INK.answer, { wrap: true }),
        ],
      };
    for (const icon of EDGE)
      if (ui.clicked(edgeId(icon))) {
        if (icon === 'banner') this.openEditor(this.bannerOf(face), face.name, face.rank <= 1);
        if (icon === 'details') this.view = 'details';
      }
    return homeNode(context, this.home(ui, face, context.sizes.label), this.turn);
  }

  /** Claims a guild bounty through the room, which pays it; the guild is asked for again once the room has saved. */
  private claim(slot: number): void {
    this.here()?.ask({ kind: ASKS.claimGuildBounty, column: slot });
    setTimeout(() => this.look(), CLAIM_SAVED_MS);
  }

  /** What the home page shows of the guild. */
  private home(ui: PlainContext['ui'], face: GuildFace, size: number): Home {
    return {
      face,
      banner: this.bannerOf(face),
      members: this.roster?.guild?.members ?? [],
      now: this.now(),
      said: this.said,
      week: contributionNode(face, size),
      bounties: face.bounties ? bountiesNode(ui, face, size, (slot) => this.claim(slot)) : undefined,
      closed: new Set(['outposts', 'treasury']),
    };
  }

  private keepsBanner = true;
  private openEditor(banner: Banner, name: string, mayKeep: boolean): void {
    this.editor = new BannerEditor(banner, name);
    this.keepsBanner = mayKeep;
    this.view = 'banner';
  }

  /** The banner editor: keeping sends the banner to the guild, or, founding, keeps it for the founding. */
  private editorNode(context: PlainContext, face: GuildFace | null): Node {
    const editor = this.editor as BannerEditor;
    return editor.node(context, {
      level: face?.level ?? 1,
      mayKeep: this.keepsBanner,
      busy: this.busy,
      back: () => this.back(),
      keep: (banner) => {
        if (face) return this.ask('guild/banner', { banner }, 'The banner is kept.');
        this.founding = banner;
        this.back();
      },
    });
  }
}

/** The Guild tab's page: the guild's, or a note that it needs an account. */
export function guildPage(context: PlainContext, page: GuildPage | null): Node {
  return (
    page?.node(context) ?? {
      width: 'grow',
      padding: 24,
      children: [hintNode('A guild needs an account. You are playing offline.')],
    }
  );
}
