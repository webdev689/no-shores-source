import { type FightEvent, type FightLook, type FightOrders, type FightView, SHOT_CYCLE } from '../rules/fightRules.ts';
import type { Pose, ShipFloats } from '../rules/landRules.ts';
import { helmOf } from '../ships/helmKeys.ts';
import { MOST_TICKS, TICK_SECONDS } from './sailing.ts';

/** Where a fight is fought: the land's rules, over the open landmass; null when another landmass is open. */
export interface FightSource {
  fightBegin(id: string, ship: ShipFloats, seed: number, time: number): Promise<FightView | null>;
  fightStep(id: string, orders: FightOrders, time: number, ticks: number): Promise<FightView | null>;
  fightEnd(): Promise<void>;
}

/** What the player does in a frame: the keys held (the helm's, and C to brace), a rung press, the look she lays
 *  while aiming, a release of the guns, and steps of the load. */
export interface FightInput {
  readonly held: ReadonlySet<string>;
  readonly press: string | undefined;
  readonly look: FightLook | null;
  readonly fire: boolean;
  readonly loadSteps: number;
}

/** How long a message stays on the panel, seconds. */
const MESSAGE_S = 3.5;
const SIDE_WORDS = { port: 'port', starboard: 'starboard' } as const;

/** DFO's words for what happened, as the panel says them, or none. */
export function wordsFor(event: FightEvent, captain: string): string | null {
  if (event.kind === 'refused') {
    if (event.why === 'no-guns') return 'No guns bear there.';
    if (event.why === 'silent') return 'Your guns are silent. The ship is crippled.';
    if (event.why === 'braced') return 'You are braced. Let go of the brace to fire.';
    const side = SIDE_WORDS[event.side ?? 'port'];
    return `The ${side} guns are reloading (${(event.left ?? 0).toFixed(1)} s).`;
  }
  if (event.kind === 'no-sail')
    return event.wrecked ? 'The ship is crippled. No sail will set.' : 'The rigging is shot away. No sail will set.';
  if (event.kind === 'state' && event.ship === 1 && event.state === 'struck') return `The ${captain} surrenders!`;
  if (event.kind === 'state' && event.ship === 1 && event.state === 'sinking') return `The ${captain} is going down!`;
  if (event.kind === 'state' && event.ship === 0 && event.state === 'wrecked')
    return 'Your ship is crippled! The sails hang in rags.';
  if (event.kind === 'state' && event.ship === 0 && event.state === 'afloat')
    return 'Your hands have her afloat again.';
  return null;
}

/** The owner's fight in the World Editor: the rules' last answer, the ticks the page owes it, the presses waiting
 *  for a step (the release, the load, a rung), the events not yet shown, and the messages on the panel. One step is
 *  with the rules at a time. */
export class Fighting {
  private readonly source: FightSource;
  private readonly id: string;
  private answer: FightView;
  private owed = 0;
  private pending = false;
  private fires = 0;
  private loadSteps = 0;
  private readonly presses: string[] = [];
  private events: FightEvent[] = [];
  /** The look held last while aiming: each release fires it, as the aim lets go the frame it is let go. */
  private lastLook: FightLook | null = null;
  private messages: { readonly text: string; readonly until: number }[] = [];

  private constructor(source: FightSource, id: string, answer: FightView, now: number) {
    this.source = source;
    this.id = id;
    this.answer = answer;
    const [x = 0, y = 0] = answer.captain.ship;
    const [ownX = 0, ownY = 0] = answer.player.ship;
    this.say(`A ${answer.captain.name} is sighted, ${Math.round(Math.hypot(x - ownX, y - ownY))} m off.`, now);
  }

  /** Calls a pirate captain onto the ring round her `ship`, or says why none comes. The rules decide where. */
  static async begin(
    source: FightSource,
    id: string,
    ship: ShipFloats,
    seed: number,
    time: number,
  ): Promise<Fighting | string> {
    const answer = await source
      .fightBegin(id, ship, seed, time)
      .catch((error: unknown) => (error instanceof Error ? error.message : String(error)));
    if (answer === null) return 'Open this landmass to fight on it.';
    if (typeof answer === 'string') return answer;
    return new Fighting(source, id, answer, time);
  }

  /** A fight begun elsewhere (the sea room's), its first view `answer`; `source` steps it. */
  static joined(source: FightSource, id: string, answer: FightView, now: number): Fighting {
    return new Fighting(source, id, answer, now);
  }

  get view(): FightView {
    return this.answer;
  }

  /** The player's Sloop as the fight last left her. */
  get player(): { readonly ship: ShipFloats; readonly pose: Pose } {
    const [heave = 0, pitch = 0, roll = 0, aground = 0] = this.answer.player.pose;
    return { ship: new Float64Array(this.answer.player.ship), pose: { heave, pitch, roll, aground: aground !== 0 } };
  }

  private say(text: string, now: number): void {
    this.messages = [...this.messages.filter((message) => message.text !== text), { text, until: now + MESSAGE_S }];
  }

  /** Owes the fight `seconds` more and, unless a step is with the rules, sends the whole ticks owed (a second's at
   *  most), the last ending at `time`, with the player's orders. Presses wait for a step. */
  advance(seconds: number, input: FightInput, time: number, fail: (error: unknown) => void): void {
    if (input.press) this.presses.push(input.press);
    if (input.fire) this.fires++;
    if (input.look) this.lastLook = input.look;
    this.loadSteps += input.loadSteps;
    this.owed = Math.min(this.owed + seconds, MOST_TICKS * TICK_SECONDS);
    if (this.pending || this.answer.over) return;
    const ticks = Math.floor(this.owed / TICK_SECONDS + 1e-6);
    if (ticks === 0) return;
    this.owed = Math.max(0, this.owed - ticks * TICK_SECONDS);
    const loaded = SHOT_CYCLE.indexOf(this.answer.player.guns.load);
    const step = Math.sign(this.loadSteps);
    const load = step === 0 ? null : (SHOT_CYCLE[(loaded + step + SHOT_CYCLE.length) % SHOT_CYCLE.length] ?? null);
    this.loadSteps -= step;
    const orders: FightOrders = {
      helm: helmOf(input.held, this.presses.shift()),
      aim: input.look ?? (this.fires > 0 ? this.lastLook : null),
      fire: this.fires > 0,
      brace: input.held.has('c'),
      load,
    };
    this.fires = Math.max(0, this.fires - 1);
    this.pending = true;
    this.source
      .fightStep(this.id, orders, time - ticks * TICK_SECONDS, ticks)
      .then((answer) => {
        this.pending = false;
        if (!answer) return;
        this.answer = answer;
        this.events.push(...answer.events);
        for (const event of answer.events) {
          const words = wordsFor(event, answer.captain.name);
          if (words) this.say(words, time);
        }
        if (answer.over === 'gone') this.say(`The ${answer.captain.name} is gone.`, time);
      })
      .catch((error: unknown) => {
        this.pending = false;
        fail(error);
      });
  }

  /** The events since last taken, for the effects. */
  takeEvents(): FightEvent[] {
    const taken = this.events;
    this.events = [];
    return taken;
  }

  /** The panel's lines at `now`: both ships' hurts and her guns, the broadside warning, and the messages. */
  lines(now: number): string[] {
    const { player, captain, lay } = this.answer;
    const [x = 0, y = 0] = captain.ship;
    const [ownX = 0, ownY = 0] = player.ship;
    const apart = Math.round(Math.hypot(x - ownX, y - ownY));
    const side = (index: 0 | 1) => (player.guns.left[index] > 0 ? `${player.guns.left[index].toFixed(1)} s` : 'ready');
    const whole = (have: number, most: number) => `${Math.ceil(have)}/${most}`;
    const lines = [
      `Your Sloop: hull ${whole(player.hull, player.max_hull)}, sails ${whole(player.sail, player.max_sail)}.` +
        ` Port ${side(0)}, starboard ${side(1)}. ${player.guns.load[0]?.toUpperCase() ?? ''}${player.guns.load.slice(1)} shot.` +
        (player.guns.braced ? ' Braced.' : ''),
      `${captain.name}, ${apart} m off, ${captain.state === 'afloat' ? captain.mode : captain.state}: hull ` +
        `${whole(captain.hull, captain.max_hull)}, sails ${whole(captain.sail, captain.max_sail)}, ${Math.round(captain.crew)} men.`,
    ];
    if (lay) lines.push(`Laying the ${lay.side} guns${lay.on_target ? ': on target.' : '.'}`);
    if (captain.run_out.length > 0 && captain.state === 'afloat') lines.push('BROADSIDE! Brace (C).');
    this.messages = this.messages.filter((message) => message.until > now);
    return [...lines, ...this.messages.map((message) => message.text)];
  }

  /** Ends the fight: the captain and her balls are gone. */
  end(): Promise<void> {
    return this.source.fightEnd();
  }
}
